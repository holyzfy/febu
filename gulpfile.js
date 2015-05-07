var gulp = require('gulp');
var debug = require('debug')('febu:' + __filename);
var minifyCss = require('gulp-minify-css');
var argv = require('yargs').argv;
var del = require('del');
var async = require('async');
var Git = require('./module/git.js');
var util = require('./module/util.js');
var db = require('./module/db.js');
var Development = require('./module/development.js');
var Production = require('./module/production.js');

var repo;
var commit = argv.commit || 'HEAD';  // 检出相应版本
var release;
var src;
var build;
var destDev;
var destRelease;
var source = [];
var project;
var ignore = ['**/*.less', '**/*.md', '**/*.markdown'];

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = util.getCwd(repo, 'src');
	build = util.getCwd(repo, 'build');
	destDev = util.getCwd(repo, 'development');
	destRelease = util.getCwd(repo, 'production');

	var formatCommit = function(cb) {
		util.formatCommit(repo, commit, function(err, data) {
			if(err) {
				return cb(err);
			}
			commit = data;
			cb();
		});
	};

	var dbInit = function(cb) {
		db.open(function(){
			db.projects.find(repo, function(err, data){
				if(err) {
					return cb(err);
				}
				data.busy = true;
				project = data;
				db.projects.save(data, cb);
			});
		});
	};

	async.series([formatCommit, dbInit], callback);
});

gulp.task('clean', ['before'], function(){
	del([build], {force: true});
});

/*

// 收集要处理的文件
gulp.task('collectFiles', ['getSource'], function(){
	return gulp.src(source, {
		base: src,
		ignore: ignore
	}).pipe(gulp.dest(build));
});

gulp.task('release_minify', ['collectFiles'], release.minify.bind(gulp, project));
gulp.task('release_html', ['release_minify'], release.html.bind(gulp, project));
*/

// 发布到测试环境
gulp.task('development', ['before'], function(callback){
	var dev = new Development(project);
	dev.db = db;
	dev.run(commit, function(err, data){
		dev.db.close(callback);
	});
});

// 发布到正式环境
gulp.task('production', ['release_html']);
