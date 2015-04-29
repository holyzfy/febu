var gulp = require('gulp');
var debug = require('debug')('febu:' + __filename);
var minifyCss = require('gulp-minify-css');
var argv = require('yargs').argv;
var del = require('del');
var Git = require('./module/git.js');
var util = require('./module/util.js');
var db = require('./module/db.js');
var dev = require('./module/development.js');
var release = require('./module/production.js');

var repo;
var commit = argv.commit || 'HEAD';  // 检出相应版本
var src;
var build;
var dest;
var source = [];
var projectCfg;
var ignore = ['**/*.less', '**/*.md', '**/*.markdown'];

// 检出版本库相应的版本
var getProject = function(projectCfg, commit, callback){
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
var getSource = function(projectCfg, commit, callback) {
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

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = util.getCwd(repo, 'src');
	build = util.getCwd(repo, 'build');
	dest = util.getCwd(repo, 'dest');

	db.init(function(){
		// TODO 标记该项目busy = true

		db.projects.find(repo, function(err, ret){
			projectCfg = ret;
			callback(err, ret);
		});
	});
});

gulp.task('clean', ['before'], function(callback){
	del([build, dest], callback);
});

gulp.task('getProject', ['before'], getProject.bind(gulp, projectCfg, commit));

gulp.task('getSource', ['clean', 'getProject'], function(callback){
	getSource.call(gulp, projectCfg, commit, function(err, ret) {
		if(err) {
			return callback(err);
		}
		source = ret;
		callback();
	});
});

// 收集要处理的文件
gulp.task('collectFiles', ['getSource'], function(){
	return gulp.src(source, {
		base: src,
		ignore: ignore
	}).pipe(gulp.dest(build));
});

gulp.task('release_minify', ['collectFiles'], release.minify.bind(gulp, projectCfg));
gulp.task('release_html', ['release_minify'], release.html.bind(gulp, projectCfg));

gulp.task('dev_resource', dev.resource.bind(gulp, projectCfg));
gulp.task('dev_html', dev.html.bind(gulp, projectCfg));

// 发布到测试环境
gulp.task('development', ['dev_resource', 'dev_html']);

// 发布到正式环境
gulp.task('production', ['release_html']);
