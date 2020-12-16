import base64 from 'base-64'
import glob from 'glob'

export default class Api_loader {
    constructor(base_path, params, shared) {
        this.init(base_path, params, shared)
    }
    async init(base_path, params, shared) {
        let { app, io, session } = params;
        this.session = session
        let api = await this.api_importer(process.cwd() + base_path)
        if (app) app.use(this.cors_loader)
        for (let path in api) {
            if (app) app.use(this.app_loader(new api[path](shared), path))
            if (io) io.of(base_path).use(this.socket_loader(new api[path](shared), path));
        }
        if (app) app.use((req, res) => res.sendStatus(404))
    }
    cors_loader = (req, res, next) => {
        req.headers.origin && res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.setHeader('Access-Control-Allow-Credentials', true);
        next();
    }
    api_importer = async (dir, reculsive = false) => {
        return new Promise((resolve) => {
            glob(dir + '/**/*.js', async (err, files) => {
                let obj = {}
                for (let file of files) {
                    let rpath = file.split(" ").join("_").split("/")
                    if (reculsive) {
                        let add = {}; let destobj = add;
                        for (let i = 1; i < rpath.length - 1; i++) { destobj[rpath[i]] = {}; destobj = destobj[rpath[i]] }
                        destobj[rpath.slice(-1)[0].split(".js")[0]] = (await import(file)).default
                        obj = { ...obj, ...add }
                    } else {
                        obj[file.slice(process.cwd().length + 1).split(".js")[0]] = (await import(file)).default
                    }
                }
                resolve(obj)
            });
        });
    }
    session_loader = (req, res) => new Promise(resolve => this.session(req, res, () => resolve(req.session.id)))
    socket_loader = (api, path) => async (socket, next, _user = 0, authorization = "", _error) => {
        let spath = path.split("/").slice(1).join("/")
        if (api.auth) {
            if (socket.handshake.headers.authorization == undefined) return next()
            try { authorization = base64.decode(socket.handshake.headers.authorization.split(" ")[1]) } catch (err) { _error = { statusCode: 401 } }
            _user = await api.auth(authorization)
            if (!_user) _error = { statusCode: 401 }
        }
        let methods = ["GET", "POST", "DELETE", "OPTIONS", "PUT", "PATCH", "COPY", "HEAD"]
        for (let method of methods)
            for (let apii in api[method]) {
                console.log((`${method}:${spath}/${apii.replace("_", "/")}`).toLowerCase())
                socket.on((`${method}:${spath}/${apii.replace("_", "/")}`).toLowerCase(), async (data, callback) => {
                    if (apii != "login") callback(_error ? _error : await api[method][apii]({ ...data, _user, self_user: _user }))
                })
            }
        next()
    }
    app_loader = (api, path) => async (req, res, next, _user = 0, authorization = "", result) => {
        if (api.auth) {
            if (req.headers.authorization == undefined) return res.sendStatus(402)
            try { authorization = base64.decode(req.headers.authorization.split(" ")[1]) } catch (err) { return res.sendStatus(401) }
            if (req.url.indexOf("login") == -1) {
                _user = await api.auth(authorization)
                if (!_user) return res.sendStatus(401)
            }
        }
        let data = { ...req.query, ...req.body }
        if (_user) data = { ...data, _user, self_user: _user }

        for (let apii in api[req.method]) {
            if (req.url == `/${path}/${apii.replace("_", "/")}`) {
                if (apii == "login") data = { ...data, authorization, sid: await this.session_loader(req, res) }
                result = await api[req.method][apii](data, req.files);
            }
        }
        if (!result) return next();
        if (result.header) for (let key in result.header) res.set(key, result.header[key]);
        if (result.redirect) return res.redirect(result.redirect);
        if (result.file) return res.sendFile(result.file);
        if (result.statusCode) return res.sendStatus(result.statusCode);
        res.send(result);
    }
}