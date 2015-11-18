var gulp = require('gulp');
var debug = require('debug')('febu:gulpfile.js');
var minifyCss = require('gulp-minify-css');
var argv = require('yargs').argv;
var del = require('del');
var async = require('async');
var path = require('path');
var common = require('./module/common.js');
var Git = require('./module/git.js');
var util = require('./module/util.js');
var Development = require('./module/development.js');
var Production = require('./module/production.js');

var repo;
var commit = argv.commit || 'HEAD';  // 检出相应版本
var release;
var src;
var build;
var source = [];
var project;
var timer;

var handleError = function(err) {
	if(handleError.busy) {
		return;
	}
	handleError.busy = true;
	console.error('发布失败: %s', err.message || err);
};

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = common.getCwd(repo, 'src');
	build = common.getCwd(repo, 'build');

	project = {
		repo: repo
	};

	var git = new Git(repo);

	var clone = function(cb) {
		git.clone(function() {
			// ignore error when destination path already exists and is not an empty directory
			cb();
		});
	};

	var tasks = [clone, git.checkout.bind(git, 'master'), git.pull.bind(git)];
	async.series(tasks, function(err) {
		clearTimeout(timer);
		callback(err);
	});

	timer = setTimeout(function() {
		callback('发布超时，请稍后重试');
	}, 240000);
})
.on('task_err', handleError);

gulp.task('clean', ['before'], function(){
	del([build], {force: true});
});

// 发布到测试环境
gulp.task('development', ['before'], function(callback){
	console.log('发布到测试环境 commit=%s', commit);
	var dev = new Development(project);
	dev.run(commit, callback);
})
.on('task_err', handleError);

// 发布到生产环境
gulp.task('production', ['before'], function(callback){
	console.log('发布到生产环境 commit=%s', commit);
	var p = new Production(project);
	p.run(commit, callback);
})
.on('task_err', handleError);
