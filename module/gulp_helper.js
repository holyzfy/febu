var path = require('path');
var async = require('async');
var debug = require('debug')('febu:' + __filename);
var util = require('./util.js');
var Git = require('./git.js');
var extend = require('extend');
var production = require('./production.js');
var development = require('./development.js');

var helper = {};

extend(helper, development);
extend(helper, production);

// 检出版本库相应的版本
helper.getProject = function(projectCfg, commit, callback){
	var git = new Git(projectCfg.repo);
	var tasks = [
		function(cb){
			debug('clone');
			var src = util.getCwd(projectCfg.repo, 'src');
			util.isEmpty(src, function(empty){
				if(empty) {
					git.clone(cb);
				} else {
					debug('仓库已存在');
					cb();
				}
			});
		},
		function(cb){
			debug('checkout master');
			git.checkout('master', cb);
		},
		function(cb){
			debug('pull');
			git.pull(cb);
		},
		function(cb){
			debug('checkout ', commit);
			git.checkout(commit, cb);
		}
	];
	async.series(tasks, callback);
};

// 收集要处理的文件列表
helper.getSource = function(projectCfg, commit, callback) {
	var source = [];
	var git = new Git(projectCfg.repo);
	var src = util.getCwd(projectCfg.repo, 'src');
	git.diff(projectCfg.version, commit, function(err, ret) {
		if(err) {
			return callback(err);
		}

		ret.forEach(function(item){
			item = path.join(src, item);
			source.push(item)
		});
		// debug('source=', source);
		callback(null, source);
	});
};

module.exports = helper;