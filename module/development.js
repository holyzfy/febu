var dev = {};

// 收集静态资源
dev.resource = function(projectCfg, callback) {
	var gulp = this;
	// TODO 输出到dest目录
	callback();
};

// 处理html文件
dev.html = function(projectCfg, callback) {
	var gulp = this;
	// TODO 替换静态资源链接
	// TODO 输出到dest目录
	// TODO 标记该项目busy = false;
	callback();
}


module.exports = dev;