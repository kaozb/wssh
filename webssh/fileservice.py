"""远端文件服务：把列目录 / 上传 / 下载三件事收进一个模块。

三个处理器原本各自做「建临时目录 -> 读写 -> 清理」，上传路径连临时目录都
没删。这里把它们退化成同一个门面背后的实现，临时文件的生命周期只在本模块。

两个适配器：
- SFTPService      : 包住 worker.sftp（实际是 scp.SCPClient，见 AGENTS.md）
- SFTPAttrService  : 用 paramiko SFTP 的 listdir_attr 拿结构化目录结果

list_dir 优先走 SFTP 结构化结果；远端未启用 SFTP 时回退到 ls -la 解析，
再不行也不会让整个目录凭空消失（旧实现 len(parts) < 9 时直接丢弃该行）。
"""

import logging
import os
import shutil
import stat as stat_module
import tempfile


def _rmtree(path):
    """清理临时目录；失败只记日志，不改变接口结果。"""
    try:
        shutil.rmtree(path)
    except OSError as exc:
        logging.warning('cleanup tmp dir %s failed: %s', path, exc)


def _human_size(size):
    """把字节数渲染成 ls -lh 风格的大小串。"""
    if size is None:
        return '-'
    size = float(size)
    for unit in ('', 'K', 'M', 'G', 'T', 'P'):
        if size < 1024:
            if unit == '':
                return str(int(size))
            return '{:.1f}{}'.format(size, unit)
        size /= 1024
    return '{:.1f}E'.format(size)


class RemoteFileService(object):
    """门面：调用方只认 list_dir / put / get 三个方法。"""

    def __init__(self, worker):
        self.worker = worker
        self.ssh = worker.ssh
        self.scp = worker.sftp  # scp.SCPClient

    # ---- 适配器 1：基于 SSH exec 的 pwd / ls 回退 -------------------------

    def _exec(self, command):
        stdin, stdout, stderr = self.ssh.exec_command(command)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        return out, err

    def _pwd(self):
        out, _ = self._exec('pwd')
        return out.strip()

    def _parse_ls_la(self, output):
        """解析 ls -la 输出。逐行独立容错，单行异常不影响整目录。"""
        entries = []
        lines = output.strip().split('\n')
        for line in lines[1:]:  # 跳过 "total" 行
            if not line.strip():
                continue
            parts = line.split(maxsplit=8)
            if len(parts) < 9:
                # 名称可能并列，退一步：至少拿到权限位与名字
                if len(parts) >= 2:
                    permissions = parts[0]
                    name = line.split(None, len(parts) - 1)[-1].strip()
                else:
                    continue
                size = '-'
            else:
                permissions = parts[0]
                size = parts[4]
                name = parts[8]

            if name in ('.', '..'):
                continue

            is_dir = permissions.startswith('d')
            entries.append({
                'name': name,
                'size': size if not is_dir else '-',
                'is_dir': is_dir,
                'is_link': permissions.startswith('l'),
                'permissions': permissions,
            })
        return entries

    def _list_dir_fallback(self, path):
        current_path = path if path != '.' else self._pwd()
        out, err = self._exec('ls -lah "{}"'.format(current_path))
        if err and 'No such file' in err:
            raise ValueError('目录不存在')
        return {
            'current_path': current_path,
            'entries': self._parse_ls_la(out),
        }

    # ---- 适配器 2：基于 paramiko SFTP 的结构化结果 ------------------------

    def _list_dir_sftp(self, path):
        sftp = self.ssh.open_sftp()
        try:
            if path == '.':
                current_path = sftp.normalize('.')
            else:
                current_path = path
            attrs = sftp.listdir_attr(current_path)
        finally:
            sftp.close()

        entries = []
        for attr in attrs:
            if attr.filename in ('.', '..'):
                continue
            mode = attr.st_mode or 0
            is_dir = stat_module.S_ISDIR(mode)
            is_link = stat_module.S_ISLNK(mode)
            entries.append({
                'name': attr.filename,
                'size': '-' if is_dir else _human_size(attr.st_size),
                'is_dir': is_dir,
                'is_link': is_link,
                'permissions': stat_module.filemode(mode),
            })
        return {'current_path': current_path, 'entries': entries}

    # ---- 对外接口 ---------------------------------------------------------

    def list_dir(self, path='.'):
        """返回 {'current_path': str, 'entries': [...]}，解析细节不出模块。"""
        try:
            return self._list_dir_sftp(path)
        except Exception as exc:
            logging.warning('SFTP listdir failed, fallback to ls: %s', exc)
            return self._list_dir_fallback(path)

    def put(self, filename, body, remote_path='.'):
        """把上传内容送到远端。临时文件用 tempfile + with，删不掉也不影响语义。"""
        remote_file_path = os.path.join(remote_path, filename).replace('\\', '/')
        tmpdir = tempfile.mkdtemp(prefix='webssh-upload-')
        filepath = os.path.join(tmpdir, filename)
        try:
            with open(filepath, 'wb') as f:
                f.write(body)
            logging.warning('File %s is saved.', filename)
            self.scp.put(filepath, remote_file_path)
        finally:
            # 清理在任何分支都执行；用 shutil.rmtree 保证「部分写入」也能扫干净
            _rmtree(tmpdir)

    def get(self, remote_path):
        """取回远端文件内容，返回 (filename, bytes)。"""
        filename = os.path.basename(remote_path)
        tmpdir = tempfile.mkdtemp(prefix='webssh-download-')
        local_path = os.path.join(tmpdir, filename)
        try:
            self.scp.get(remote_path, local_path)
            with open(local_path, 'rb') as f:
                content = f.read()
            return filename, content
        finally:
            # 传输失败时 local_path 可能不存在，rmtree 一样能把目录清掉
            _rmtree(tmpdir)
