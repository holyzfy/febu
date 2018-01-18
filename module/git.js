var debug = require('debug')('febu:git.js');
var fs = require('fs-extra');
var spawn = require('child_process').spawn;
var colors = require('colors');
var common = require('./common.js');

/**
 * @constructor
 * @param url 仓库地址
 * @param {Object} options 其他参数
 */
function Git(url, options) {
    this.binary = 'git';
	this.url = url;
    options = options || {};
	this.options = options || {};
    this.options.type = options.type || 'src';
    this.options.cwd = options.cwd || common.getCwd(url, this.options.type);
}

/**
 * 运行git命令
 * @param  {String} command  git命令
 * @param  {Array}   args     git参数
 * @param  {Function} callback(err, data)
 */
Git.prototype.exec = function(command, args, callback) {
    callback = arguments[arguments.length - 1];
    if (arguments.length < 3) {
        args = [];
    }
    
    args.unshift(command);
    debug('git command=', this.binary, args.join(' '));
    var result = spawn(this.binary, args, {cwd: this.options.cwd, stdio: 'inherit'});
    result.on('close', callback);
};

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径构成（/用_代替）
 * @param callback(err)
 */
Git.prototype.clone = function(callback) {
	var local = common.getCwd(this.url, 'src');
    fs.mkdirs(local, err => {
        if(err) {
            return callback(err);
        }
        this.exec('clone', [this.url, local], callback);
    });
};

/**
 * 检出指定版本
 * @param commit 分支名或者版本号
 * @param callback(err)
 */
Git.prototype.checkout = function(commit, callback){
    this.exec('checkout', [commit], callback);
};

module.exports = Git;