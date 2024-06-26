# 说明


## 使用方式 docker-compose启动


```yaml
git clone https://gitlab.inone.nsfocus.com/tp/public/webssh
cd webssh
docker-compose up -d
```

访问宿主机器的 ip:8000
如果有需求，可以修改配置文件，修改docker-compose.yml的端口号，默认8000


## 增加保存历史登录记录的功能（支持删除）
![](https://wework.qpic.cn/wwpic3az/480577_96jSg0i5QZKIqFr_1718086305)

##  新增文件上传功能 2024-06-07

文件总和最大500M
![](https://wework.qpic.cn/wwpic3az/724267_7g-wP-SnSWG_aDE_1717741238)

## 相比于原版，增加了双重验证码
保证ssh即使密码被破解也不会轻易被攻破

[2AF相关资料](https://docs.github.com/zh/authentication/securing-your-account-with-two-factor-authentication-2fa/about-two-factor-authentication)
启用方法：
```bash
wssh --af2=随机字符串
```

安装方式：
```bash
pip install https://github.com/kaozb/wssh/releases/download/v6/webssh-1.6.2-py2.py3-none-any.whl
```

登录时除了要求输入密码（基于时间的一次性密码），还要求输入6位数的验证码（验证码是根据字符串+时间计算而出） 不可逆。
可以自行下载2AF工具计算或者在线工具计算。注意保存那个随机字符串    如果怀疑泄露，直接更换即可


## WebSSH

[![python](https://github.com/huashengdun/webssh/actions/workflows/python.yml/badge.svg)](https://github.com/huashengdun/webssh/actions/workflows/python.yml)
[![codecov](https://raw.githubusercontent.com/huashengdun/webssh/coverage-badge/coverage.svg)](https://raw.githubusercontent.com/huashengdun/webssh/coverage-badge/coverage.svg)
![PyPI - Python Version](https://img.shields.io/pypi/pyversions/webssh.svg)
![PyPI](https://img.shields.io/pypi/v/webssh.svg)



### Preview

![Login](preview/login.png)
![Terminal](preview/terminal.png)


### How it works
```
+---------+     http     +--------+    ssh    +-----------+
| browser | <==========> | webssh | <=======> | ssh server|
+---------+   websocket  +--------+    ssh    +-----------+
```

### Requirements

* Python 3.8+


### Quickstart

1. Install this app, run command `pip install webssh`
2. Start a webserver, run command `wssh`
3. Open your browser, navigate to `127.0.0.1:8888`
4. Input your data, submit the form.


### Server options

```bash
# start a http server with specified listen address and listen port
wssh --address='2.2.2.2' --port=8000

# start a https server, certfile and keyfile must be passed
wssh --certfile='/path/to/cert.crt' --keyfile='/path/to/cert.key'

# missing host key policy
wssh --policy=reject

# logging level
wssh --logging=debug

# log to file
wssh --log-file-prefix=main.log

# more options
wssh --help
```

### Browser console

```javascript
// connect to your ssh server
wssh.connect(hostname, port, username, password, privatekey, passphrase, totp);

// pass an object to wssh.connect
var opts = {
  hostname: 'hostname',
  port: 'port',
  username: 'username',
  password: 'password',
  privatekey: 'the private key text',
  passphrase: 'passphrase',
  totp: 'totp'
};
wssh.connect(opts);

// without an argument, wssh will use the form data to connect
wssh.connect();

// set a new encoding for client to use
wssh.set_encoding(encoding);

// reset encoding to use the default one
wssh.reset_encoding();

// send a command to the server
wssh.send('ls -l');
```

### Custom Font

To use custom font, put your font file in the directory `webssh/static/css/fonts/` and restart the server.

### URL Arguments

Support passing arguments by url (query or fragment) like following examples:

Passing form data (password must be encoded in base64, privatekey not supported)
```bash
http://localhost:8888/?hostname=xx&username=yy&password=str_base64_encoded
```

Passing a terminal background color
```bash
http://localhost:8888/#bgcolor=green
```

Passing a terminal font color
```bash
http://localhost:8888/#fontcolor=red
```

Passing a user defined title
```bash
http://localhost:8888/?title=my-ssh-server
```

Passing an encoding
```bash
http://localhost:8888/#encoding=gbk
```

Passing a font size
```bash
http://localhost:8888/#fontsize=24
```

Passing a command executed right after login
```bash
http://localhost:8888/?command=pwd
```

Passing a terminal type
```bash
http://localhost:8888/?term=xterm-256color
```

### Deployment

Running behind an Nginx server

```bash
wssh --address='127.0.0.1' --port=8888 --policy=reject
```
```nginx
# Nginx config example
location / {
    proxy_pass http://127.0.0.1:8888;
    proxy_http_version 1.1;
    proxy_read_timeout 300;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Real-PORT $remote_port;
}
```

Running as a standalone server
```bash
wssh --port=8080 --sslport=4433 --certfile='cert.crt' --keyfile='cert.key' --xheaders=False --policy=reject
```
