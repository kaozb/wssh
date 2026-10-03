"""会话注册表：把「ip -> id -> worker」的查找与收尾收进一个深模块。

上游把 clients 字典直接暴露给 handler 与 worker，导致同一套查找被抄在多个
调用点，文案也逐渐分叉。这里提供唯一入口，调用方只需知道：

    get_worker(src_addr, id)  -> Worker，找不到抛 SessionNotFound
    register(ip, worker)      -> 登记一个刚建好的会话
    add_workers(ip, workers)  -> 建立某 ip 的 workers 容器（连接前预检用）
    recycle(worker)           -> 到期回收（无 handler 时关闭）
    expire(worker, reason)    -> 统一的收尾入口，代理 Worker.close

clients 是进程内全局字典（AGENTS.md 硬约束），仍是本模块的唯一存储。
"""

import logging

# {ip: {id: worker}}  —— 进程内全局会话表
clients = {}


class SessionNotFound(Exception):
    """解析会话失败。文案统一，避免各调用点各写一份。"""

    def __init__(self, message='未找到连接'):
        super(SessionNotFound, self).__init__(message)


def add_workers(ip, workers):
    """把 workers 容器登记到 clients[ip]（若该 ip 尚无容器则写入）。"""
    if not workers:
        workers = {}
        clients[ip] = workers
    return workers


def register(ip, worker):
    """登记一条已建立的会话，返回所属 workers 容器。"""
    workers = add_workers(ip, clients.get(ip, {}))
    worker.src_addr = (ip, worker.src_addr[1]) if worker.src_addr else worker.src_addr
    workers[worker.id] = worker
    return workers


def get_worker(src_addr, id):
    """由 (ip, port) 与 id 解析出 worker。

    src_addr 为 (ip, port) 元组；ip 无会话或 id 不存在都抛 SessionNotFound。
    """
    ip = src_addr[0]
    workers = clients.get(ip)
    if not workers:
        raise SessionNotFound('未找到连接')
    worker = workers.get(id)
    if not worker:
        raise SessionNotFound('未找到工作进程')
    return worker


def clear_worker(worker):
    """会话结束时把它从 clients 中摘掉；容器空了逐级清理。"""
    ip = worker.src_addr[0]
    workers = clients.get(ip)
    if not workers or worker.id not in workers:
        return
    workers.pop(worker.id)

    if not workers:
        clients.pop(ip)
        if not clients:
            clients.clear()


def recycle(worker):
    """到期回收：仍被 websocket 占用时不动，否则交给 expire 收尾。"""
    if worker.handler:
        return
    logging.warning('Recycling worker {}'.format(worker.id))
    expire(worker, reason='worker recycled')


def expire(worker, reason=None):
    """唯一的会话收尾入口，代理 Worker.close。

    外部不再直接调用 Worker.close；删除这一层，查找与收尾会重新散回各处。
    """
    worker.close(reason=reason)
