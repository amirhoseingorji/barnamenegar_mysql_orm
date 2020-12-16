import mysql2 from 'mysql2/promise.js';
import SocksConnection from 'socksjs';
class Db {
    constructor(par) {
        this.par = par;
        this.constructor.par = par;
        this.static("con,tables,columns,map,root,dbn".split(","));
    }
    static(str) {
        this.foreach(str, (val) => {
            if (this.constructor[val] == undefined) this.constructor[val] = '';
        })
    }
    async reconnect() {
        let { database, user, pass, password, server, socks } = this.constructor.params
        let conn = await this.connect(database, user, pass || password, server, socks);
    }
    async init() {
        let { database, user, pass, password, server, socks } = this.par
        if (database) {
            this.constructor.params = { database, user, pass, password, server, socks }
            await this.connect(database, user, pass || password, server, socks);
            this.constructor.tables = await this.query("SHOW TABLES", true);
            this.constructor.columns = await new Tables("information_schema.COLUMNS");
            this.constructor.root = this;
            this.constructor.dbn = database;
            await this.reset();
        }
        return this;
    }
    async reset() {
        this.foreach(this, function (v, k) { delete this.k; })
        this.constructor.map = this.maper();
        this.name = "";
        this.address = [];
        await this.tableclass();
    }
    maper(map = []) {
        this.foreach(this.constructor.tables, function (table) {
            var tmp = table.toString().split("_")
            for (var i = 0; i < tmp.length; i++) {
                var tmp2 = tmp.slice(0, i + 1);
                eval('if(undefined!=map["' + tmp2.join('"]["') + '"]) true; else map["' + tmp2.join('"]["') + '"]=[];');
            }
        })
        return map;
    }
    async tableclass() {
        this.foreach(this.mapChild(this), async function (table) {
            var myadrs = [...this.address];
            if (!myadrs.includes(table)) {
                myadrs.push(table);
                this[table] = await new Tables(myadrs);
            }
        });
    }
    async connect(database, user = "root", password, host = "localhost", socks) {
        let mysql_options = { user, database, password };
        if (socks) mysql_options.stream = new SocksConnection({ host, port: 3306 }, { port: socks }); else mysql_options.host = host;
        try {
            this.constructor.con = await mysql2.createConnection(mysql_options);
        } catch (e) { console.log(e); }
    }
    async query(sql, fetch = true) {
        console.log("sql ::::   " + sql)
        if (fetch == "query") {
            this.debug(sql);
            return sql;
        }
        if (sql) try {
            var [rows] = await this.constructor.con.query({ sql: sql, rowsAsArray: fetch });
            return rows;
        } catch (e) {
            this.debug(e);
            if (e.toString().indexOf("connection is in closed state") > 0) process.exit();
        } else this.debug('nosql');
    }
    debug(str) {
        console.log("debug:", str);
    }
    Obj(table) {
        if (typeof table == "object") table = table.join('.');
        table = "." + table.split("_").join(".");
        var o; eval("o = this.constructor.root" + table);
        return o;
    }
    mapChild(dest = []) {
        var mymap;
        if (typeof (dest) == "string") {
            if (dest == "") mymap = this.constructor.map; else eval('mymap = this.constructor.map["' + dest.split('_').join('"]["') + '"];');
        } else if (typeof (dest[0]) == "string") {
            eval('mymap = this.constructor.map["' + dest.join('"]["') + '"];');
        } else {
            if (dest == this.constructor.root) mymap = this.constructor.map;
            else eval('mymap = this.constructor.map["' + dest.address.join('"]["') + '"];');
        }
        let map = Object.keys(mymap);
        return map;
    }
    join(tb1, tb2 = [], on = [], mode = "inner") {
        if (this.name != "") {
            mode = on; on = tb2; tb2 = tb1; tb1 = this;
        }
        if (typeof (on) == "string") on = [on, on];
        if (on.length == 0) {
            var c1 = tb1.columns
            var c2 = tb2.columns
            for (var i in c1) for (var j in c2) if (i == j) on = [i, j];
            for (var i in c1) if (i == "_" + tb2.name) on = [i, "id"];
            for (var i in c2) if (i == "_" + tb1.name) on = ["id", i];
        }
        return new Tables(tb1, tb2, on, mode);
    }
    async create(tb, par = {}) {
        var def = [];
        def["id"] = "int(11) NOT NULL AUTO_INCREMENT,PRIMARY KEY (`id`)";
        def["pid"] = "int(11),key (`pid`)";
        def["ord"] = "int(11)";
        this.foreach(this.address, function (parent, level) {
            parent = this.address.slice(0, level + 1).join("_");
            def["_" + parent] = "int(11) NULL,key (`_" + parent + "`)";
        });
        var dest = this.address.concat([tb]);
        var name = dest[dest.length - 1];
        tb = dest.join("_");
        if (!this.constructor.tables.includes(tb)) {
            var cols = [];
            this.foreach(def, function (v, K) {
                cols.push("`" + K + "` " + v);
            })
            cols = cols.join(",");
            var res = await this.query("CREATE TABLE `" + tb + "` (" + cols + ") ENGINE=MyISAM DEFAULT CHARSET=utf8;");
            this.constructor.tables.push(tb);
            await this.constructor.root.reset();
            if (par != {}) {
                await this.Obj(dest).col_add(par);
            }
        } else res = false;
        return res;
    }

    async rename(table, rename = 0, plevel = 0) {
        var dest, tb, Inew, ndest = [], ntb, par, cols, res
        dest = this.address;
        if (typeof (rename) == "number") {
            plevel = rename;
            rename = table;
        } else dest.push(table);
        tb = dest.join("_");
        Inew = [];
        Inew[dest.length - 1 - plevel] = rename;
        for (var i in dest) ndest[i] = dest[i]
        for (var i in Inew) ndest[i] = Inew[i]
        ntb = ndest.join("_");
        var map = this.mapChild(dest)
        for (var ic in map) {
            var child = dest.concat([map[ic]]);
            await this.Obj(child).rename(rename, plevel + 1);
        }
        par = [{ 'column_name': "_" + tb }];
        cols = await this.constructor.columns.col_info(par);
        par = {};
        par["_" + tb] = "_" + ntb;
        for (let itb in cols) {
            await this.Obj(cols[itb][0]).col_rename(par);
        }
        res = await this.query("ALTER TABLE `" + tb + "` RENAME `" + ntb + "`");
        this.constructor.tables.push(ntb);
        this.constructor.tables = this.constructor.tables.filter(e => ([tb]).indexOf(e) < 0)
        await this.constructor.root.reset();
        return !res.warningStatus;
    }

    async drop(tb = "") {
        var dest = (tb != "") ? this.address.concat([tb]) : this.address;
        tb = dest.join("_");
        if (this.constructor.tables.includes(tb)) {
            let map = this.mapChild(dest);
            this.foreach(this.mapChild(dest), (table) => {
                eval(this.Obj(dest) + '.drop(table);');
            })
            let par = [{
                'column_name': "_" + tb
            }];
            let cols = await this.constructor.columns.col_info(par, true);
            for (let itb in cols) {
                await this.Obj(cols[itb][0]).col_drop(["_" + tb]);
            }
            var res = await this.query("DROP TABLE `" + tb + "`", "");
            var tables = this.constructor.root.constructor.tables;
            for (var i in tables) if (tables[i] == tb) delete this.constructor.root.constructor.tables[i];
            await this.constructor.root.reset();
            return !res.warningStatus
        } else {
            this.debug("Error! : " + tb + "is not table");
            return false;
        }
    }
    async copy(tb, to = "") {
        var dest, pos, name, ndest, ntb, nname, qselect, npos
        dest = this.address;
        if (to != "") dest.push(tb);
        else to = tb;
        pos = this.Obj(dest);
        tb = dest.join("_");
        name = dest[dest.length - 1];
        ndest = to.address;
        ndest.push(name);
        ntb = ndest.join("_");
        while (this.constructor.tables.includes(ntb)) {
            ndest[ndest.length - 1] += "$copy";
            ntb = ndest.join("_");
        }
        nname = ndest[ndest.length - 1];
        qselect = await pos.select([], "query");
        var res = await this.query("create TABLE `" + ntb + "` " + qselect);
        this.constructor.root.constructor.tables.push(ntb);
        await this.constructor.root.reset();
        var npos = this.Obj(ndest);
        var par = [];
        var columns = undefined != npos.columns ? npos.columns : npos.col_get();
        this.foreach(columns, function (col) {
            if (col.indexOf(tb) > -1) par[col] = col.split(tb).join(ntb);
        });
        await npos.col_rename(par);
        var par = [];
        for (i = 1; i < Math.min(dest.length, ndest.length); i++) {
            var destp = dest.slice(0, i);
            var tbp = destp.join("_");
            var ndestp = ndest.slice(0, i);
            var ntbp = ndestp.join("_");
            this.foreach(columns, function (col) {
                if (col.indexOf(tbp) > -1) par[col] = col.split(tbp).join(ntbp);
            })
        }
        await npos.col_rename(par);
        var par = [];
        for (var i = 1; i < ndest.length; i++) {
            var ndestp = ndest.slice(0, i);
            var ntbp = ndestp.join("_");
            this.foreach(columns, function (col) {
                par[col] = "int(11) NULL";
            })
        }
        await npos.col_rename(par);
        var map = this.mapChild(dest)
        for (var c in map) {
            child = dest.push(map[c]);
            await this.Obj(child).copy(npos);
        }
        return !res.warningStatus;
    }
    async move(tb, to = "") {
        if (to == "") { to = tb; tb = this };
        var res = await tb.copy(to) ? await tb.drop() : false;
        return res;
    }
    foreach(_ar, _fn) {
        this._fn = _fn;
        for (var _key in _ar) this._fn(_ar[_key], _key)
    };
}
class Tables extends Db {
    constructor(address, tb2 = "", on = [], mode = "inner") {
        super();
        this._constructor(address, tb2, on, mode)
    }
    async _constructor(address, tb2, on, mode) {
        if (tb2 == "" && typeof (address) == "object") {
            this.address = address;
            this.parts = [this];
            this.name = address.join("_");
            await this.tableclass();
            await this.col_get();
        } else if (tb2 == "") {
            this.name = address;
            this.parts = [this];
        } else {
            var tb1, p1, p2, i, on1, on2, tbn1, tbn2, ip1, ip2;
            tb1 = address;
            p1 = tb1.parts;
            p2 = tb2.parts;
            this.parts = p1;
            this.parts = this.parts.concat(p2);
            for (i = 0; i < p1.length; i++) if (on[i] != "") ip1 = i;
            for (i = p1.length; i < on.length; i++)if (on[i] != "") ip2 = i;
            on1 = on[ip1];
            on2 = on[ip2];
            tbn1 = this.parts[ip1].address.join("_");
            tbn2 = this.parts[ip2].address.join("_");
            this.name = "(" + tb1.name + " " + mode + " JOIN " + tb2.name + " ON " + tbn1 + "." + on1 + " = " + tbn2 + "." + on2 + ")";
        }
    }
    async select(par = [], fetch = false) {
        var cols, iwhere, having, num, nt, where, group, asc = 0, order, limit, distinct, total, into, query, page, start;
        fetch = par.fetch || fetch;
        cols = "*";
        iwhere = [];
        having = [];
        num = 10;
        for (var key in par) if (isNaN(key)) eval(key + "= par[key]");
        nt = this.parts.length;
        if (typeof (where) == "string") iwhere.unshift(where);
        else if (typeof (where) == "object") par[0] = where;
        for (var i = 0; i < nt; i++) {
            if (typeof (par[i]) == "object") iwhere[i] = this.filter(par[i], this.parts[i]);
        }
        where = iwhere.length > 0 ? " where " + iwhere.join(" and ") : "";
        group = (undefined != group) ? " Group by " + group + " " : "";
        if ((undefined != group) && having == [] && typeof (undefined != par[nt]) == "array") having = par[1];
        having = having.length == 0 ? "" : " having " + this.filter(having) + " ";
        var ascar = ["DESC", "ASC"];
        order = (undefined != order) ? " Order by " + order + " " + ascar[asc * 1] + " " : "";
        limit = (undefined != page) ? " limit " + (page - 1) * num + "," + num : ((undefined != par['num']) ? " limit " + num : "");
        distinct = (undefined != distinct) ? " DISTINCT " : "";
        into = (undefined != into) ? " INTO " + into : "";
        total = (undefined != total) ? " SQL_CALC_FOUND_ROWS " : "";
        query = "select " + total + distinct + " " + cols + " " + into + " from " + this.name + " " + where + " " + group + " " + having + " " + order + " " + limit;
        if (fetch == "query") return query;
        var res = await this.query(query, fetch)
        return res;
    }
    async count(par = {}) {
        par.cols = "count(*)"
        var res = await this.select(par, true);
        return res[0][0];
    }
    async delete(where = []) {
        where = where != [] ? " where " + this.filter(where) : "";
        let res = await this.query("DELETE from `" + this.name + "` " + where, "");
        return res ? res.affectedRows : 0;
    }
    async truncate() {
        return await this.query("TRUNCATE `" + this.name + "`", "");
    }
    async insert(par = {}) {
        let keys = '`' + Object.keys(par).join('`,`') + '`';
        let vals = Object.values(par);
        this.foreach(vals, function (v, k) {
            vals[k] = this.q(v);
        })
        vals = vals.join(',');
        let res = await this.query('INSERT INTO `' + this.name + '` (' + keys + ') VALUES (' + vals + ');', "");
        return res ? (res.affectedRows ? res.insertId : false) : false;
    }
    async insert2(par = {}) {
        let vals = []
        for (let key in par) mixtuer.push(key + " = " + this.q(par[key]))
        vals = vals.join(',');
        let res = await this.query('INSERT `' + this.name + '` set ' + vals, "");
        return res ? (res.affectedRows ? res.insertId : false) : false;
    }
    async update(par = [], where = []) {
        if (par.where) { where = par.where; delete par.where; }
        let update = [];
        where = where != [] ? " where " + this.filter(where) : "";
        this.foreach(par, (item, key) => {
            update.push("`" + key + "`=" + this.q(item));
        })
        update = update.join(",");
        let res = await this.query("UPDATE `" + this.name + "` SET " + update + " " + where + ";", "");
        return res ? res.affectedRows : 0;
    }
    async inselect(par = []) {
        return "{IN (" + await this.select(par, "query") + ")}";
    }
    filter(ar = [], alias = "") {
        if (this.parts.length == 1) alias = "";
        var str = [];
        var al = alias == "" ? "" : "`" + alias.address.join("_") + "`.";
        for (let key in ar) {
            let item = ar[key]
            if (key == "or") {
                if (typeof (item[0]) == "object") {
                    var nstr = []
                    for (var nkey in item) {
                        nstr.push("(" + this.filter(item[nkey], alias) + ")");
                    }
                    str.push("(" + nstr.join(" or ") + ")")
                } else str.push(" or (" + this.filter(item, alias) + ")");
            } else if (typeof (item) == "object") {
                var nstr = []
                for (var nkey in item) {
                    nstr.push(al + "`" + key + "` " + this.s(item[nkey]));
                }
                str.push("(" + nstr.join(" or ") + ")")
            } else {
                str.push(al + "`" + key + "` " + this.s(item));
            }
        }
        return str.join(" And ").split("And  or").join("or").split("(or").join("(");
    }
    q(v) {
        var s = v.toString().slice(0, 1);
        if (s == "{") return v.slice(1, -1);
        if (s === "=") return v.slice(1);
        if (s === "!") return v.slice(1);
        return (s != "`" && s != "'" && parseInt(v) !== v) ? "'" + v + "'" : v;
    }
    s(v) {
        var s = v.toString().slice(0, 1);
        if (s == "{") s = v.slice(1, -1);
        else if (s === ">" || s === "<" || s === "=" || s === "!") s = v;
        else if (s != "`" && s != "'" && parseInt(v) !== v) s = " like '" + v + "'";
        else s = "=" + v;
        return s;
    }
    async col_info(par = [{}], mod = false) {
        par.cols = "column_name,column_type,column_default,extra";
        if (par[0] == undefined) par[0] = {};
        par[0].TABLE_SCHEMA = this.constructor.dbn;
        if (this != this.constructor.columns) par[0].table_name = this.name;
        else par.cols = "table_name";
        var res = await this.constructor.columns.select(par, mod);
        return res;
    }
    async col_get(par = {}) {
        var columns, cols = [], ords = []
        columns = await this.col_info(par);
        this.foreach(columns, function (c, o) {
            if (c.table_name) {
                if (cols[c.table_name] == undefined) {
                    cols[c.table_name] = [];
                }
            } else {
                ords[o] = c.column_name;
                c.column_default = c.column_default == "" ? "NULL" : "default " + c.column_default;
                cols[c.column_name] = c.column_type + " " + c.column_default + " " + c.extra;
            }
        })
        this.columns = cols;
        this.columns_order = ords;
        return cols;
    }
    async col_add(par = {}) {
        var columns, cols, ords
        columns = undefined != this.columns ? this.columns : await this.col_get();
        cols = [];
        delete par["id"];
        delete par["pid"];
        this.foreach(par, function (v, k) {
            if (!Object.keys(columns).includes(k)) {
                cols.push("add `" + k + "` " + v);
                if (k.slice(1).includes(this.constructor.tables)) cols.push("add key(`" + k + "`)");
                this.columns.push(v);
                this.columns_order.push(k);
            }
        });
        cols = cols.join(" , ");
        return cols == "" ? 0 : await this.query("ALTER TABLE `" + this.name + "` " + cols + ";", "");
    }
    async col_drop(par, target = this) {
        var columns, cols, ords
        columns = target.columns != undefined ? target.columns : await target.col_get();
        cols = [];
        target.foreach(par, function (v) {
            if (Object.keys(columns).includes(k)) {
                cols.push("drop " + v);
                delete target.columns[v];
                target.columns_order.splice(target.columns_order.indexOf(v), 1);
            }
        });
        cols = cols.join(" , ");
        return cols == "" ? 0 : await target.query("ALTER TABLE `" + target.name + "` " + cols + ";", "");
    }
    async col_rename(par) {
        var columns, cols, ords
        columns = undefined != this.columns ? this.columns : await this.col_get();
        cols = [];
        this.foreach(par, function (v, k) {
            if (Object.keys(columns).includes(k) && !Object.keys(columns).includes(v)) {
                cols.push("change `" + k + "` " + v + " " + columns[k]);
                if (v.slice(1).includes() && columns[k].slice(0, 3) == "int")
                    cols.push("add key(`" + v + "`)");
                this.columns[v] = this.columns[k];
                delete this.columns[k];
                this.columns_order[this.columns_order.indexOf(k)] = v;
            }
        });
        cols = cols.join(" , ");
        return cols == "" ? 0 : await this.query("ALTER TABLE `" + this.name + "` " + cols + ";", "");
    }
    async col_modify(par) {
        columns = undefined != this.columns ? this.columns : await this.col_get();
        cols = [];
        this.foreach(par, function (v, k) {
            if (Object.keys(columns).includes(k)) {
                cols.push("modify `" + k + "` " + v);
                this.columns[k] = v;
            }
        })
        cols = cols.join(" , ");
        return cols == "" ? 0 : await this.query("ALTER TABLE `" + this.name + "` " + cols + ";", "");
    }
    async col_order(par) {
        columns = undefined != this.columns ? this.columns : await this.col_get();
        cols = [];
        this.foreach(par, function (v, k) {
            if (Object.keys(columns).includes(k)) {
                after = this.columns_order[parseInt(v) + 1];
                cols.push("modify `" + k + "` " + columns[k] + " after " + after);
                this.columns_order[this.columns_order.indexOf(k)] = "*";
                this.columns_order = this.columns_order.slice(0, parseInt(v) + 1).concat([k], this.columns_order.slice(parseInt(v) + 2));
                this.columns_order.splice(this.columns_order.indexOf("*"), 1);
            }
        });
        cols = cols.join(" , ");
        return cols == "" ? 0 : await this.query("ALTER TABLE `" + this.name + "` " + cols + ";", "");
    }
    async col_copy(par1, par2, par3 = "") {
        var columns, cols, dest_columns, j
        columns = undefined != this.columns ? this.columns : await this.col_get();
        dest_columns = undefined != par2.columns ? par2.columns : par2.col_get();
        cols = [];
        j = 1;
        this.foreach(par1, function (v) {
            if (Object.keys(columns).includes(v) && !Object.keys(dest_columns).includes(v)) {
                after = par3 != "" ? "after " + par2.columns_order[parseInt(par3) + j] : "";
                cols = cols.push("add " + columns[v] + " " + this.columns[v] + " " + after);
                par2.columns[v] = this.columns[v];
                par2.columns_order = par2.columns_order.slice(0, parseInt(par3) + j).concat([v], par2.columns_order.slice(parseInt(par3) + j + 1));
                j++;
            }
        })
        return cols == "" ? 0 : await this.query("ALTER TABLE `" + par2.name + "` " + cols + ";", "");
    }
    async col_move(par1, par2, par3 = "") {
        return (await this.col_copy(par1, par2, par3 = "")) ? await this.col_drop(par1) : false;
    }
}
export default {
    Db: Db,
    Tables: Tables
}
