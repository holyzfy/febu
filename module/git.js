var spawn = require('child_process').spawn;
var url = require('url');
var mkdirp = require('mkdirp');
var path = require('path');
var debug = require('debug')('febu:' + __filename);
var config = require('../config.js');
var async = require('async');
var through2 = require('through2');
var Q = require('q');

/**
 * @constructor
 * @param url 仓库地址
 * @param {Object} options 其他参数
 */
function Git(url, options) {
    this.binary = 'git';
	this.url = url;
	this.options = options || {};
}

/**
 * 运行git命令
 * @param  {String} command  git命令
 * @param  {Array}   args     git参数
 * @param  {Function} callback(err, data)
 */
Git.prototype.exec = function(command, args, callback) {
    var git = this;
    callback = arguments[arguments.length - 1];
    if (arguments.length < 3) {
        args = [];
    }
    args = [command].concat(args);
    // debug('git exec args=', args);
    var p = spawn(git.binary, args, git.options);
    var done = false;
    var ret;
    var dfd = Q.defer();
    var dfdStdout = Q.defer();
    var dfdStdErr = Q.defer();

    dfd.promise.then(function(ret){
        callback(null, ret);
    }, function(err){
        callback(err);
    });

    var outAll = [];
    p.stdout.pipe(through2(function out(chunk, enc, cb) {
        outAll.push(chunk);
        cb(null, chunk);
    }, function(){
        ret = outAll.join('');
        // debug('p stdout:', ret);
        dfdStdout.resolve(ret);
    }));

    var errAll = [];
    p.stderr.pipe(through2(function out(chunk, enc, cb) {
        errAll.push(chunk);
        cb(null, chunk);
    }, function(){
        ret = errAll.join('');
        // debug('p stderr:', ret);
        dfdStdErr.resolve(ret);
    }));

    p.on('error', function(err) {
        if(done) return;
        done = true;
        // debug('p error:', arguments);
        ret = [git.binary].concat(args).join(' ');
        dfd.reject(ret);
    });

    // 出错时exit事件可能不被触发
    p.on('exit', function(code, signal) {
        if(done) return;
        done = true;
        Q.all([dfdStdout.promise, dfdStdErr.promise]).then(function(ret){
            if(code === 0) {
                // debug('p exit resolve:', ret[0]);
                dfd.resolve(ret[0]);
            } else {
                // debug('p exit reject:', ret[1]);
                dfd.reject(ret[1]);
            }
        });
    });

    return git;
};


/**
 * 取得本地仓库的根目录
 */
Git.getCwd = function(repo) {
    var dataPath = config.dataPath || 'data/';
    var urlMap = url.parse(repo);
    var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
    var local = path.resolve(dataPath, 'src', urlMap.hostname, pathname);
    return local;
};

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径构成（/用_代替）
 * @param callback(err)
 */
Git.prototype.clone = function(callback) {
	var git = this;
	var dataPath = config.dataPath || 'data/';
	var urlMap = url.parse(git.url);
	var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
	var local = path.resolve(dataPath, 'src', urlMap.hostname, pathname);
	async.each([dataPath, local], mkdirp, function(err) {
		if(err) {
			return callback(err);
		}
		git.exec('clone', [git.url, local], callback);
	});
	return git;
}

/**
 * 从远程仓库拉取当前分支
 * @param callback(err)
 */
Git.prototype.pull = function(callback){
	var git = this;
    git.exec('pull', callback);
	return this;
};

/**
 * 检出指定版本
 * @param commit 分支名或者版本号
 * @param callback(err)
 */
Git.prototype.checkout = function(commit, callback){
	var git = this;
    git.exec('checkout', [commit], callback);
	return git;
};

/**
 * 查询日志
 * @param commit 版本号
 * @param callback(err, Object.<commit, date, message, author>)
 */
Git.prototype.show = function(commit, callback) {
	var git = this;
    var args = ['--pretty=format:%h | %an | %ct%n%s', '--no-patch', commit];
    git.exec('show', args, function(err, data) {
        // debug('show:', arguments);
        if(err) {
            return callback(err);
        }

        var dataArray = data.split(/\r?\n/);
        var reg = /^([^|]+)\s*|\s*([^|]+)\s*|\s*([[^|]+])$/gi;
        var metadata = dataArray[0].match(reg);
        // 转成毫秒
        var date = metadata[2].trim();
        date = date.length < 13 ? parseInt(date) * 1000 : date;
        var ret = {
            commit: metadata[0].trim(),
            author: metadata[1].trim(),
            datetime: date,
            message: dataArray[1].trim()
        }
        // debug('show callback ret=', ret);
        callback(null, ret);
    });
	return git;
};

/**
 * 比较两次提交的差异
 * @param from 版本号
 * @param [to] 版本号
 * @param callback(err, Array)
 */
Git.prototype.diff = function(from, to, callback) {
	var git = this;
    callback = arguments[arguments.length - 1];
    // 跳过已删除的文件
    var args = [from, to, '--name-only', '--diff-filter=ACMRTUXB'];
    git.exec('diff', args, function(err, data){
        if(err) {
            return callback(err);
        }

        var ret = data.trim().split(/\r?\n/);
        callback(null, ret);
    });

    return git;
};

module.exports = Git;