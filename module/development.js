var debug = require('debug')('febu:' + __filename);

function Dev(projectCfg) {
	this.config = projectCfg;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, boolean)
 */
Dev.prototype.exist = function(commit, callback) {
	this.checkout('master', function(err, cb){
		debug('exist');
		if(err) {
			return callback(err);
		}
		// TODO
		callback(null, false); // 测试
	});
};

// 收集静态资源
Dev.prototype.resource = function(callback) {
	// TODO 输出到dest目录
	debug('resource');
	callback(); // 测试
};

// 处理html文件
Dev.prototype.html = function(callback) {
	debug('html');
	// TODO 替换静态资源链接
	// TODO 输出到dest目录
	// TODO 标记该项目busy = false;
	callback(); // 测试
}

Dev.prototype.checkout = function(commit, callback) {
	debug('checkout ', commit);
	callback(); // 测试
};

/**
 * 把发布好的文件提交到目标仓库
 * @param  callback(err, commit) commit对应目标仓库的版本号
 */
Dev.prototype.commit = function(callback) {
	// TODO
	debug('commit');
	callback(); // 测试
};


module.exports = Dev;