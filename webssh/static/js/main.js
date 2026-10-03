/*jslint browser:true */

var jQuery;
var wssh = {};

// sessionStore：会话 id 的唯一权威。写 id 与读 id 都只认它，
// DOM class 退回纯样式。定义置于顶部，保证登录回调调用 set 时已就绪。
var sessionStore = (function () {
    var id = '';
    return {
        set: function (value) { id = value || ''; },
        get: function () { return id; }
    };
})();


(function () {
    // For FormData without getter and setter
    var proto = FormData.prototype,
        data = {};

    if (!proto.get) {
        proto.get = function (name) {
            if (data[name] === undefined) {
                var input = document.querySelector('input[name="' + name + '"]'),
                    value;
                if (input) {
                    if (input.type === 'file') {
                        value = input.files[0];
                    } else {
                        value = input.value;
                    }
                    data[name] = value;
                }
            }
            return data[name];
        };
    }

    if (!proto.set) {
        proto.set = function (name, value) {
            data[name] = value;
        };
    }
}());


jQuery(function ($) {
    var status = $('#status'),
        button = $('.btn-primary'),
        form_container = $('.form-container'),
        waiter = $('#waiter'),
        term_type = $('#term'),
        style = {},
        default_title = 'WebSSH',
        title_element = document.querySelector('title'),
        form_id = '#connect',
        debug = document.querySelector(form_id).noValidate,
        custom_font = document.fonts ? document.fonts.values().next().value : undefined,
        default_fonts,
        DISCONNECTED = 0,
        CONNECTING = 1,
        CONNECTED = 2,
        state = DISCONNECTED,
        messages = {1: 'This client is connecting ...', 2: 'This client is already connnected.'},
        key_max_size = 16384,
        fields = ['hostname', 'port', 'username'],
        form_keys = fields.concat(['password', 'totp']),
        opts_keys = ['bgcolor', 'title', 'encoding', 'command', 'term', 'fontsize', 'fontcolor', 'cursor'],
        url_form_data = {},
        url_opts_data = {},
        validated_form_data,
        event_origin,
        hostname_tester = /((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))|(^\s*((?=.{1,255}$)(?=.*[A-Za-z].*)[0-9A-Za-z](?:(?:[0-9A-Za-z]|\b-){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|\b-){0,61}[0-9A-Za-z])?)*)\s*$)/;


    function store_items(names, data) {
        var i, name, value;

        for (i = 0; i < names.length; i++) {
            name = names[i];
            value = data.get(name);
            if (value) {
                window.localStorage.setItem(name, value);
            }
        }
    }


    function restore_items(names) {
        var i, name, value;

        for (i = 0; i < names.length; i++) {
            name = names[i];
            value = window.localStorage.getItem(name);
            if (value) {
                $('#' + name).val(value);
            }
        }
    }


    function populate_form(data) {
        var names = form_keys.concat(['passphrase']),
            i, name;

        for (i = 0; i < names.length; i++) {
            name = names[i];
            $('#' + name).val(data.get(name));
        }
    }


    function get_object_length(object) {
        return Object.keys(object).length;
    }


    function decode_uri_component(uri) {
        try {
            return decodeURIComponent(uri);
        } catch (e) {
            console.error(e);
        }
        return '';
    }


    function decode_password(encoded) {
        try {
            return window.atob(encoded);
        } catch (e) {
            console.error(e);
        }
        return null;
    }


    function parse_url_data(string, form_keys, opts_keys, form_map, opts_map) {
        var i, pair, key, val,
            arr = string.split('&');

        for (i = 0; i < arr.length; i++) {
            pair = arr[i].split('=');
            key = pair[0].trim().toLowerCase();
            val = pair.slice(1).join('=').trim();

            if (form_keys.indexOf(key) >= 0) {
                form_map[key] = val;
            } else if (opts_keys.indexOf(key) >= 0) {
                opts_map[key] = val;
            }
        }

        if (form_map.password) {
            form_map.password = decode_password(form_map.password);
        }
    }


    function parse_xterm_style() {
        var text = $('.xterm-helpers style').text();
        var arr = text.split('xterm-normal-char{width:');
        style.width = parseFloat(arr[1]);
        arr = text.split('div{height:');
        style.height = parseFloat(arr[1]);
    }


    function get_cell_size(term) {
        style.width = term._core._renderService._renderer.dimensions.actualCellWidth;
        style.height = term._core._renderService._renderer.dimensions.actualCellHeight;
    }


    function toggle_fullscreen(term) {
        $('#terminal .terminal').toggleClass('fullscreen');
        term.fitAddon.fit();
    }


    function current_geometry(term) {
        if (!style.width || !style.height) {
            try {
                get_cell_size(term);
            } catch (TypeError) {
                parse_xterm_style();
            }
        }

        var cols = parseInt(window.innerWidth / style.width, 10) - 1;
        var rows = parseInt(window.innerHeight / style.height, 10);
        return {'cols': cols, 'rows': rows};
    }


    function resize_terminal(term) {
        var geometry = current_geometry(term);
        term.on_resize(geometry.cols, geometry.rows);
    }


    function set_backgound_color(term, color) {
        term.setOption('theme', {
            background: color
        });
    }

    function set_font_color(term, color) {
        term.setOption('theme', {
            foreground: color
        });
    }

    function custom_font_is_loaded() {
        if (!custom_font) {
            console.log('No custom font specified.');
        } else {
            console.log('Status of custom font ' + custom_font.family + ': ' + custom_font.status);
            if (custom_font.status === 'loaded') {
                return true;
            }
            if (custom_font.status === 'unloaded') {
                return false;
            }
        }
    }

    function update_font_family(term) {
        if (term.font_family_updated) {
            console.log('Already using custom font family');
            return;
        }

        if (!default_fonts) {
            default_fonts = term.getOption('fontFamily');
        }

        if (custom_font_is_loaded()) {
            var new_fonts = custom_font.family + ', ' + default_fonts;
            term.setOption('fontFamily', new_fonts);
            term.font_family_updated = true;
            console.log('Using custom font family ' + new_fonts);
        }
    }


    function reset_font_family(term) {
        if (!term.font_family_updated) {
            console.log('Already using default font family');
            return;
        }

        if (default_fonts) {
            term.setOption('fontFamily', default_fonts);
            term.font_family_updated = false;
            console.log('Using default font family ' + default_fonts);
        }
    }


    function format_geometry(cols, rows) {
        return JSON.stringify({'cols': cols, 'rows': rows});
    }


    function read_as_text_with_decoder(file, callback, decoder) {
        var reader = new window.FileReader();

        if (decoder === undefined) {
            decoder = new window.TextDecoder('utf-8', {'fatal': true});
        }

        reader.onload = function () {
            var text;
            try {
                text = decoder.decode(reader.result);
            } catch (TypeError) {
                console.log('Decoding error happened.');
            } finally {
                if (callback) {
                    callback(text);
                }
            }
        };

        reader.onerror = function (e) {
            console.error(e);
        };

        reader.readAsArrayBuffer(file);
    }


    function read_as_text_with_encoding(file, callback, encoding) {
        var reader = new window.FileReader();

        if (encoding === undefined) {
            encoding = 'utf-8';
        }

        reader.onload = function () {
            if (callback) {
                callback(reader.result);
            }
        };

        reader.onerror = function (e) {
            console.error(e);
        };

        reader.readAsText(file, encoding);
    }


    function read_file_as_text(file, callback, decoder) {
        if (!window.TextDecoder) {
            read_as_text_with_encoding(file, callback, decoder);
        } else {
            read_as_text_with_decoder(file, callback, decoder);
        }
    }


    function reset_wssh() {
        var name;

        for (name in wssh) {
            if (wssh.hasOwnProperty(name) && name !== 'connect') {
                delete wssh[name];
            }
        }
    }


    function log_status(text, to_populate) {
        console.log(text);
        status.html(text.split('\n').join('<br/>'));

        if (to_populate && validated_form_data) {
            populate_form(validated_form_data);
            validated_form_data = undefined;
        }

        if (waiter.css('display') !== 'none') {
            waiter.hide();
        }

        if (form_container.css('display') === 'none') {
            form_container.show();
        }
    }


    function ajax_complete_callback(resp) {
        button.prop('disabled', false);

        if (resp.status !== 200) {
            log_status(resp.status + ': ' + resp.statusText, true);
            state = DISCONNECTED;
            return;
        }

        var msg = resp.responseJSON;
        if (!msg.id) {
            log_status(msg.status, true);
            state = DISCONNECTED;
            return;
        }
        waiter.show();
        var statusDiv = document.getElementById('status');
        // sessionStore 是会话 id 的唯一权威；DOM class 退回纯样式，
        // 这里仍保留写 class 以兼容既有样式/调试习惯（见 AGENTS.md）。
        sessionStore.set(msg.id);
        statusDiv.className = msg.id;
        var ws_url = window.location.href.split(/\?|#/, 1)[0].replace('http', 'ws'),
            join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
            url = ws_url + join + 'ws?id=' + msg.id,
            sock = new window.WebSocket(url),
            encoding = 'utf-8',
            decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding,
            terminal = document.getElementById('terminal'),
            termOptions = {
                cursorBlink: true,
                theme: {
                    background: url_opts_data.bgcolor || 'black',
                    foreground: url_opts_data.fontcolor || 'white',
                    cursor: url_opts_data.cursor || url_opts_data.fontcolor || 'white'
                }
            };

        if (url_opts_data.fontsize) {
            var fontsize = window.parseInt(url_opts_data.fontsize);
            if (fontsize && fontsize > 0) {
                termOptions.fontSize = fontsize;
            }
        }

        var term = new window.Terminal(termOptions);

        term.fitAddon = new window.FitAddon.FitAddon();
        term.loadAddon(term.fitAddon);

        console.log(url);
        if (!msg.encoding) {
            console.log('Unable to detect the default encoding of your server');
            msg.encoding = encoding;
        } else {
            console.log('The deault encoding of your server is ' + msg.encoding);
        }

        function term_write(text) {
            if (term) {
                term.write(text);
                if (!term.resized) {
                    resize_terminal(term);
                    term.resized = true;
                }
            }
        }

        function set_encoding(new_encoding) {
            // for console use
            if (!new_encoding) {
                console.log('An encoding is required');
                return;
            }

            if (!window.TextDecoder) {
                decoder = new_encoding;
                encoding = decoder;
                console.log('Set encoding to ' + encoding);
            } else {
                try {
                    decoder = new window.TextDecoder(new_encoding);
                    encoding = decoder.encoding;
                    console.log('Set encoding to ' + encoding);
                } catch (RangeError) {
                    console.log('Unknown encoding ' + new_encoding);
                    return false;
                }
            }
        }

        wssh.set_encoding = set_encoding;

        if (url_opts_data.encoding) {
            if (set_encoding(url_opts_data.encoding) === false) {
                set_encoding(msg.encoding);
            }
        } else {
            set_encoding(msg.encoding);
        }


        wssh.geometry = function () {
            // for console use
            var geometry = current_geometry(term);
            console.log('Current window geometry: ' + JSON.stringify(geometry));
        };

        wssh.send = function (data) {
            // for console use
            if (!sock) {
                console.log('Websocket was already closed');
                return;
            }

            if (typeof data !== 'string') {
                console.log('Only string is allowed');
                return;
            }

            try {
                JSON.parse(data);
                sock.send(data);
            } catch (SyntaxError) {
                data = data.trim() + '\r';
                sock.send(JSON.stringify({'data': data}));
            }
        };

        wssh.reset_encoding = function () {
            // for console use
            if (encoding === msg.encoding) {
                console.log('Already reset to ' + msg.encoding);
            } else {
                set_encoding(msg.encoding);
            }
        };

        wssh.resize = function (cols, rows) {
            // for console use
            if (term === undefined) {
                console.log('Terminal was already destroryed');
                return;
            }

            var valid_args = false;

            if (cols > 0 && rows > 0) {
                var geometry = current_geometry(term);
                if (cols <= geometry.cols && rows <= geometry.rows) {
                    valid_args = true;
                }
            }

            if (!valid_args) {
                console.log('Unable to resize terminal to geometry: ' + format_geometry(cols, rows));
            } else {
                term.on_resize(cols, rows);
            }
        };

        wssh.set_bgcolor = function (color) {
            set_backgound_color(term, color);
        };

        wssh.set_fontcolor = function (color) {
            set_font_color(term, color);
        };

        wssh.custom_font = function () {
            update_font_family(term);
        };

        wssh.default_font = function () {
            reset_font_family(term);
        };

        term.on_resize = function (cols, rows) {
            if (cols !== this.cols || rows !== this.rows) {
                console.log('Resizing terminal to geometry: ' + format_geometry(cols, rows));
                this.resize(cols, rows);
                sock.send(JSON.stringify({'resize': [cols, rows]}));
            }
        };

        term.onData(function (data) {
            // console.log(data);
            sock.send(JSON.stringify({'data': data}));
        });

        sock.onopen = function () {
            term.open(terminal);
            toggle_fullscreen(term);
            update_font_family(term);
            term.focus();
            state = CONNECTED;
            title_element.text = url_opts_data.title || default_title;
            if (url_opts_data.command) {
                setTimeout(function () {
                    sock.send(JSON.stringify({'data': url_opts_data.command + '\r'}));
                }, 500);
            }
        };

        sock.onmessage = function (msg) {
            read_file_as_text(msg.data, term_write, decoder);
        };

        sock.onerror = function (e) {
            console.error(e);
        };

        sock.onclose = function (e) {
            term.dispose();
            term = undefined;
            sock = undefined;
            reset_wssh();
            log_status(e.reason, true);
            state = DISCONNECTED;
            default_title = 'WebSSH';
            title_element.text = default_title;
        };

        $(window).resize(function () {
            if (term) {
                resize_terminal(term);
            }
        });
    }


    function wrap_object(opts) {
        var obj = {};

        obj.get = function (attr) {
            return opts[attr] || '';
        };

        obj.set = function (attr, val) {
            opts[attr] = val;
        };

        return obj;
    }


    function clean_data(data) {
        var i, attr, val;
        var attrs = form_keys.concat(['privatekey', 'passphrase']);

        for (i = 0; i < attrs.length; i++) {
            attr = attrs[i];
            val = data.get(attr);
            if (typeof val === 'string') {
                data.set(attr, val.trim());
            }
        }
    }


    function validate_form_data(data) {
        clean_data(data);

        var hostname = data.get('hostname'),
            port = data.get('port'),
            username = data.get('username'),
            pk = data.get('privatekey'),
            result = {
                valid: false,
                data: data,
                title: ''
            },
            errors = [], size;

        if (!hostname) {
            errors.push('Value of hostname is required.');
        } else {
            if (!hostname_tester.test(hostname)) {
                errors.push('Invalid hostname: ' + hostname);
            }
        }

        if (!port) {
            port = 22;
        } else {
            if (!(port > 0 && port <= 65535)) {
                errors.push('Invalid port: ' + port);
            }
        }

        if (!username) {
            errors.push('Value of username is required.');
        }

        if (pk) {
            size = pk.size || pk.length;
            if (size > key_max_size) {
                errors.push('Invalid private key: ' + pk.name || '');
            }
        }

        if (!errors.length || debug) {
            result.valid = true;
            result.title = username + '@' + hostname + ':' + port;
        }
        result.errors = errors;

        return result;
    }

    // Fix empty input file ajax submission error for safari 11.x
    function disable_file_inputs(inputs) {
        var i, input;

        for (i = 0; i < inputs.length; i++) {
            input = inputs[i];
            if (input.files.length === 0) {
                input.setAttribute('disabled', '');
            }
        }
    }


    function enable_file_inputs(inputs) {
        var i;

        for (i = 0; i < inputs.length; i++) {
            inputs[i].removeAttribute('disabled');
        }
    }


    function connect_without_options() {
        // use data from the form
        var form = document.querySelector(form_id),
            inputs = form.querySelectorAll('input[type="file"]'),
            url = form.action,
            data, pk;

        disable_file_inputs(inputs);
        data = new FormData(form);
        pk = data.get('privatekey');
        enable_file_inputs(inputs);

        function ajax_post() {
            status.text('');
            button.prop('disabled', true);

            $.ajax({
                url: url,
                type: 'post',
                data: data,
                complete: ajax_complete_callback,
                cache: false,
                contentType: false,
                processData: false
            });
        }

        var result = validate_form_data(data);
        if (!result.valid) {
            log_status(result.errors.join('\n'));
            return;
        }

        if (pk && pk.size && !debug) {
            read_file_as_text(pk, function (text) {
                if (text === undefined) {
                    log_status('Invalid private key: ' + pk.name);
                } else {
                    ajax_post();
                }
            });
        } else {
            ajax_post();
        }

        return result;
    }


    function connect_with_options(data) {
        // use data from the arguments
        var form = document.querySelector(form_id),
            url = data.url || form.action,
            _xsrf = form.querySelector('input[name="_xsrf"]');

        var result = validate_form_data(wrap_object(data));
        if (!result.valid) {
            log_status(result.errors.join('\n'));
            return;
        }

        data.term = term_type.val();
        data._xsrf = _xsrf.value;
        if (event_origin) {
            data._origin = event_origin;
        }

        status.text('');
        button.prop('disabled', true);

        $.ajax({
            url: url,
            type: 'post',
            data: data,
            complete: ajax_complete_callback
        });

        return result;
    }


    function connect(hostname, port, username, password, privatekey, passphrase, totp) {
        // for console use
        var result, opts;

        if (state !== DISCONNECTED) {
            console.log(messages[state]);
            return;
        }

        if (hostname === undefined) {
            result = connect_without_options();
        } else {
            if (typeof hostname === 'string') {
                opts = {
                    hostname: hostname,
                    port: port,
                    username: username,
                    password: password,
                    privatekey: privatekey,
                    passphrase: passphrase,
                    totp: totp
                };
            } else {
                opts = hostname;
            }

            result = connect_with_options(opts);
        }

        if (result) {
            state = CONNECTING;
            default_title = result.title;
            if (hostname) {
                validated_form_data = result.data;
            }
            store_items(fields, result.data);
        }
    }

    wssh.connect = connect;

    $(form_id).submit(function (event) {
        event.preventDefault();
        connect();
    });


    function cross_origin_connect(event) {
        console.log(event.origin);
        var prop = 'connect',
            args;

        try {
            args = JSON.parse(event.data);
        } catch (SyntaxError) {
            args = event.data.split('|');
        }

        if (!Array.isArray(args)) {
            args = [args];
        }

        try {
            event_origin = event.origin;
            wssh[prop].apply(wssh, args);
        } finally {
            event_origin = undefined;
        }
    }

    window.addEventListener('message', cross_origin_connect, false);

    if (document.fonts) {
        document.fonts.ready.then(
            function () {
                if (custom_font_is_loaded() === false) {
                    document.body.style.fontFamily = custom_font.family;
                }
            }
        );
    }


    parse_url_data(
        decode_uri_component(window.location.search.substring(1)) + '&' + decode_uri_component(window.location.hash.substring(1)),
        form_keys, opts_keys, url_form_data, url_opts_data
    );
    // console.log(url_form_data);
    // console.log(url_opts_data);

    if (url_opts_data.term) {
        term_type.val(url_opts_data.term);
    }

    if (url_form_data.password === null) {
        log_status('Password via url must be encoded in base64.');
    } else {
        if (get_object_length(url_form_data)) {
            waiter.show();
            connect(url_form_data);
        } else {
            restore_items(fields);
            form_container.show();
        }
    }

});


// 文件管理器功能
var fileManagerModal = document.getElementById('fileManagerModal');
var fileManagerBtn = document.getElementById('file-manager-btn');
var closeModal = document.querySelector('.close-modal');
var currentPath = '.';

// 打开文件管理器
fileManagerBtn.onclick = function() {
    if (!sessionStore.get()) {
        alert('请先连接SSH');
        return;
    }
    fileManagerModal.style.display = 'block';
    loadFileList(currentPath);
};

// 关闭文件管理器
closeModal.onclick = function() {
    fileManagerModal.style.display = 'none';
};

window.onclick = function(event) {
    if (event.target == fileManagerModal) {
        fileManagerModal.style.display = 'none';
    }
};

// 加载文件列表
function loadFileList(path) {
    var fileListContainer = document.getElementById('fileListContainer');
    fileListContainer.innerHTML = '<div class="loading">加载中...</div>';
    
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/filelist', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            var response = JSON.parse(xhr.responseText);
            if (response.error) {
                fileListContainer.innerHTML = '<div class="loading" style="color: #e74c3c;">错误: ' + response.error + '</div>';
                return;
            }
            
            currentPath = response.current_path;
            document.getElementById('currentPath').textContent = currentPath;
            
            if (response.files.length === 0) {
                fileListContainer.innerHTML = '<div class="loading">目录为空</div>';
                return;
            }
            
            var html = '';
            response.files.forEach(function(file) {
                var icon = file.is_dir ? '📁' : '📄';
                var fileItemClass = file.is_dir ? 'file-item dir-item' : 'file-item';
                
                html += '<div class="' + fileItemClass + '" data-name="' + file.name + '" data-is-dir="' + file.is_dir + '">';
                html += '  <div class="file-info">';
                html += '    <span class="file-icon">' + icon + '</span>';
                html += '    <span class="file-name">' + file.name + '</span>';
                html += '  </div>';
                html += '  <span class="file-size">' + file.size + '</span>';
                
                if (!file.is_dir) {
                    html += '  <div class="file-actions">';
                    html += '    <button onclick="downloadFile(\'' + file.name + '\')">下载</button>';
                    html += '  </div>';
                } else {
                    html += '  <div class="file-actions">';
                    html += '    <button onclick="enterDirectory(\'' + file.name + '\')">进入</button>';
                    html += '  </div>';
                }
                
                html += '</div>';
            });
            
            fileListContainer.innerHTML = html;
        } else {
            fileListContainer.innerHTML = '<div class="loading" style="color: #e74c3c;">加载失败</div>';
        }
    };
    
    var data = 'id=' + encodeURIComponent(sessionStore.get()) + '&path=' + encodeURIComponent(path);
    xhr.send(data);
}

// 进入目录
function enterDirectory(dirName) {
    var newPath = currentPath;
    if (currentPath.endsWith('/')) {
        newPath = currentPath + dirName;
    } else {
        newPath = currentPath + '/' + dirName;
    }
    loadFileList(newPath);
}

// 返回上级目录
document.getElementById('parentDirBtn').onclick = function() {
    if (currentPath === '.' || currentPath === '~') {
        loadFileList('.');
        return;
    }
    
    var parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    if (!parentPath) {
        parentPath = '/';
    }
    loadFileList(parentPath);
};

// 刷新文件列表
document.getElementById('refreshBtn').onclick = function() {
    loadFileList(currentPath);
};

// 下载文件
function downloadFile(fileName) {
    var remotePath = currentPath;
    if (!remotePath.endsWith('/')) {
        remotePath += '/';
    }
    remotePath += fileName;
    
    // 显示下载提示
    var fileListContainer = document.getElementById('fileListContainer');
    var originalContent = fileListContainer.innerHTML;
    fileListContainer.innerHTML = '<div class="loading" style="color: #3498db;">正在下载 ' + fileName + '...</div>' + originalContent;
    
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/filedownload', true);
    xhr.responseType = 'blob'; // 重要：设置响应类型为blob
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onload = function() {
        // 移除下载提示
        fileListContainer.innerHTML = originalContent;
        
        if (xhr.status === 200) {
            // 检查响应是否为JSON错误消息
            var contentType = xhr.getResponseHeader('Content-Type');
            if (contentType && contentType.indexOf('application/json') !== -1) {
                // 是JSON错误响应
                var reader = new FileReader();
                reader.onload = function() {
                    var response = JSON.parse(reader.result);
                    alert('下载失败: ' + (response.error || '未知错误'));
                };
                reader.readAsText(xhr.response);
                return;
            }
            
            // 创建一个临时URL
            var blob = xhr.response;
            var url = window.URL.createObjectURL(blob);
            
            // 创建一个隐藏的a标签并触发下载
            var a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            
            // 清理
            setTimeout(function() {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        } else {
            alert('下载失败，请重试');
        }
    };
    
    xhr.onerror = function() {
        fileListContainer.innerHTML = originalContent;
        alert('下载失败，请检查网络连接');
    };
    
    var data = 'id=' + encodeURIComponent(sessionStore.get()) + '&remote_path=' + encodeURIComponent(remotePath);
    xhr.send(data);
}

// 上传文件
document.getElementById('uploadFileBtn').onclick = function() {
    document.getElementById('fileInput').click();
};

document.getElementById('fileInput').onchange = function(e) {
    uploadFiles(e.target.files);
};

// 上传文件夹
document.getElementById('uploadFolderBtn').onclick = function() {
    document.getElementById('folderInput').click();
};

document.getElementById('folderInput').onchange = function(e) {
    uploadFiles(e.target.files);
};

// 上传文件函数
function uploadFiles(files) {
    if (files.length === 0) return;
    
    var uploadArea = document.getElementById('uploadArea');
    uploadArea.innerHTML = '<p style="color: #3498db;">⏳ 上传中... 0/' + files.length + '</p>';
    
    var formData = new FormData();
    for (var i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    formData.append('id', sessionStore.get());
    formData.append('remote_path', currentPath);
    
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/filesend', true);
    
    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            var percentComplete = (e.loaded / e.total) * 100;
            uploadArea.innerHTML = '<p style="color: #3498db;">⏳ 上传中... ' + Math.round(percentComplete) + '%</p>';
        }
    };
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            var response = JSON.parse(xhr.responseText);
            if (response.success) {
                uploadArea.innerHTML = '<p style="color: #2ecc71;">✅ 上传成功!</p>';
                setTimeout(function() {
                    uploadArea.innerHTML = '<p>📤 拖拽文件到此处上传，或点击上方按钮选择文件</p><p style="color: #95a5a6; font-size: 12px;">支持多文件同时上传</p>';
                    loadFileList(currentPath);
                }, 2000);
            } else {
                uploadArea.innerHTML = '<p style="color: #e74c3c;">❌ 上传失败: ' + (response.error || '未知错误') + '</p>';
                setTimeout(function() {
                    uploadArea.innerHTML = '<p>📤 拖拽文件到此处上传，或点击上方按钮选择文件</p><p style="color: #95a5a6; font-size: 12px;">支持多文件同时上传</p>';
                }, 3000);
            }
        } else {
            uploadArea.innerHTML = '<p style="color: #e74c3c;">❌ 上传失败</p>';
            setTimeout(function() {
                uploadArea.innerHTML = '<p>📤 拖拽文件到此处上传，或点击上方按钮选择文件</p><p style="color: #95a5a6; font-size: 12px;">支持多文件同时上传</p>';
            }, 3000);
        }
    };
    
    xhr.onerror = function() {
        uploadArea.innerHTML = '<p style="color: #e74c3c;">❌ 上传失败</p>';
        setTimeout(function() {
            uploadArea.innerHTML = '<p>📤 拖拽文件到此处上传，或点击上方按钮选择文件</p><p style="color: #95a5a6; font-size: 12px;">支持多文件同时上传</p>';
        }, 3000);
    };
    
    xhr.send(formData);
    
    // 清空文件选择
    document.getElementById('fileInput').value = '';
    document.getElementById('folderInput').value = '';
}

// 拖拽上传
var uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
    
    var files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
});

// 点击上传区域选择文件
uploadArea.addEventListener('click', function() {
    document.getElementById('fileInput').click();
});
