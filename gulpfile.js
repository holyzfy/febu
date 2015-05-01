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
var dev;
var release;
var src;
var build;
var destDev;
var destRelease;
var source = [];
var projectCfg;
var ignore = ['**/*.less', '**/*.md', '**/*.markdown'];

var formatCommit = function(repo, commit, cb) {
	if(commit === 'HEAD') {
		// 取得HEAD版本的版本号
		var git = new Git(repo);
		var args = ['--pretty=format:%h', '--no-patch', commit];
	    git.exec('show', args, function(err, data) {
	    	if(err) {
	            return callback(err);
	        }
	        cb(null, data);
	    });
	} else {
		cb(null, commit);
	}
};

// 检出版本库相应的版本
var getProject = function(projectCfg, commitId, callback){
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
			debug('formatCommit');
			formatCommit(projectCfg.repo, commitId, function(err, data) {
				if(err) {
					return cb(err);
				}
				commit = data;
				cb();
			})
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
	if(projectCfg.version) {
		git.diff(projectCfg.version, commit, function(err, ret) {
			if(err) {
				return callback(err);
			}

			ret.forEach(function(item){
				item = path.join(src, item);
				source.push(item)
			});
			callback(null, source);
		});
	} else {
		callback(null, ['**/*']);
	}
};

/**
 * 标记为已发布
 * @param  Object.<type, srcCommit, destCommit, projectCfg, db> options
 *                type 			发布类型，有效值development, production
 *                srcCommit		源版本号
 *                destCommit	对应目标仓库的版本号
 *                projectCfg
 *                db
 * @param callback
 */
var mark = function(options, callback) {

};

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}
	repo = argv.repo;
	src = util.getCwd(repo, 'src');
	build = util.getCwd(repo, 'build');
	destDev = util.getCwd(repo, 'development');
	destRelease = util.getCwd(repo, 'production');
	db.init(function(){
		// TODO 标记该项目busy = true

		db.projects.find(repo, function(err, ret){
			projectCfg = ret;
			dev = new Development(projectCfg);
			// TODO release = new Production(projectCfg);
			callback(err, ret);
		});
	});
});

gulp.task('clean', ['before'], function(){
	del([build], {force: true});
});

/*
gulp.task('getProject', ['clean', 'before'], getProject.bind(gulp, projectCfg, commit));

gulp.task('getSource', ['getProject'], function(callback){
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
*/

// 发布到测试环境
gulp.task('development', ['before'], function(callback) {
	dev.exist(commit, function(err, exist) {
		if(err) {
			return callback(err);
		}

		if(exist) {
			dev.checkout(commit, callback);
		} else {
			dev.commit(function(err, data){
				if(err) {
					return callback(err);
				}
				var args = {
					type: 'development',
					srcCommit: commit,
					destCommit: data,
					projectCfg: projectCfg,
					db: db
				}
				mark(args, callback);
			});
		}
	});
});

// 发布到正式环境
gulp.task('production', ['release_html']);

module.exports = {
	debug: {
		formatCommit: formatCommit,
		getProject: getProject,
		getSource: getSource,
		mark: mark
	}
};
