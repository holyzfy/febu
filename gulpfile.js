var gulp = require('gulp');
var debug = require('debug')('febu:' + __filename);
var minifyCss = require('gulp-minify-css');
var argv = require('yargs').argv;
var del = require('del');
var Git = require('./module/git.js');
var util = require('./module/util.js');
var db = require('./module/db.js');
var helper = require('./module/gulp_helper.js');

var repo;
var commit = argv.commit || 'HEAD';  // 检出相应版本
var src;
var build;
var dest;
var source = [];
var projectCfg;
var ignore = ['**/*.less', '**/*.md', '**/*.markdown'];

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = util.getCwd(repo, 'src');
	build = util.getCwd(repo, 'build');
	dest = util.getCwd(repo, 'dest');

	db.init().projects.find(repo, function(err, ret){
		projectCfg = ret;
		callback(err, ret);
	});
});

gulp.task('clean', ['before'], function(callback){
	debug('clean');
	del([build, dest], callback);
});

gulp.task('getProject', ['before'], function(callback){
	debug('getProject');
	helper.getProject.call(gulp, projectCfg, commit, callback);
});

gulp.task('getSource', ['clean', 'getProject'], function(callback){
	debug('getSource');
	helper.getSource.call(gulp, projectCfg, commit, function(err, ret) {
		if(err) {
			return callback(err);
		}
		source = ret;
		callback();
	});
});

// 收集要处理的文件
gulp.task('collectFiles', ['getSource'], function(){
	debug('collectFiles ', source);
	return gulp.src(source, {
		base: src,
		ignore: ignore
	}).pipe(gulp.dest(build));
});

gulp.task('minify', ['collectFiles'], function() {
	debug('minify');
	return helper.minify.call(gulp, projectCfg);
});

gulp.task('html', ['minify'], function() {
	debug('html');
	return helper.html.call(gulp, projectCfg);
});

// 上线
gulp.task('release', ['html']);
