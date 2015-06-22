var gulp = require('gulp');
var debug = require('debug')('febu:' + __filename);
var minifyCss = require('gulp-minify-css');
var argv = require('yargs').argv;
var del = require('del');
var async = require('async');
var common = require('./module/common.js');
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

var source = [];
var project;

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = common.getCwd(repo, 'src');
	build = common.getCwd(repo, 'build');

	var initDB = function(cb) {
		db.open(function(){
			db.projects.find(repo, function(err, data){
				if(err) {
					db.close();
					return cb(err);
				} else if(data.busy) {
					db.close();
					return cb('该项目正在发布，请稍后再试');
				}
				data.busy = true;
				project = data;
				db.projects.save(data, cb);
				cb();
			});
		});
	};

	var git = new Git(repo);

	var clone = function(cb) {
		git.clone(function() {
			cb();
		});
	};

	var formatCommit = function(cb) {
		util.formatCommit(function(err, data) {
			commit = data;
			cb(err);
		});
	};

	async.series([initDB, clone, git.checkout.bind(git, 'master'), git.pull.bind(git), formatCommit], callback);
});

gulp.task('clean', ['before'], function(){
	del([build], {force: true});
});

var closeDb = function(callback) {
	db.projects.find(repo, function(err, data){
		if(err) {
			return callback(err);
		}
		data.busy = false;
		db.projects.save(data, db.close.bind(db));
	});
};

// 发布到测试环境
gulp.task('development', ['before'], function(callback){
	var dev = new Development(project);
	dev.db = db;
	dev.run(commit, closeDb);
});

// 发布到正式环境
// gulp.task('production', ['release_html']);
