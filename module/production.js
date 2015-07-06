var path = require('path');
var fs = require('fs');
var debug = require('debug')('febu:' + __filename);
var rename = require("gulp-rename");
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var replace = require('gulp-replace');
var util = require('./util.js');
var common = require('./common.js');
var Git = require('../module/git.js');

// 项目里有requirejs的构建脚本吗
var hasAMD;

function Production(project) {
	this.project = project;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, boolean)
 */
Production.prototype.exist = function(commit, callback) {
	var p = this;

	var git = new Git(p.project.repo, {
		type: 'production'
	});
	var gitDir = path.join(git.options.cwd, '.git');
	fs.exists(gitDir, function(ret) {
		if(ret) {
			p.checkout('master', function(err, cb){
				if(err) {
					return callback(err);
				}
				var conditions = {
					repo: p.repo,
					src: commit
				};
				p.db.versions.find(conditions, function(err, ret) {
					if(err) {
						return callback(err);
					}
					if(!!ret) {
						debug('该版本已发布过，直接签出');
					}
					callback(null, !!ret);
				});
			});
		} else {
			callback(null, ret);
		}
	});
};

/**
 * 取得带版本号的文件路径
 * @param {String | Array} filepath 文件路径（相对于项目根目录）
 * @return {Function(err, newFilePath)} callback
 */
Production.prototype.getFilePath = function(filepath, callback) {
	var filepath = [].concat(filepath);
	// TODO
	// 如果未查到，就向数据库里新插入一条记录
};

// 收集静态资源
Production.prototype.resource = function(source, callback) {
	debug('resource');
	var p = this;
	gulp.task('resource', function(){
		var src = common.getCwd(p.project.repo, 'src');
		src = hasAMD ? path.join(src, 'www') : src;
		var destRoot = common.getCwd(p.project.repo, 'production');
		var dest = path.join(destRoot, 'static');
		gulp.src(source, {
			base: src
		})
		.pipe(gulpFilter(util.getStaticFileType()))
		.pipe(gulp.dest(dest))
		.on('end', callback)
		.on('error', callback);
	});
	gulp.start('resource');
};

Production.prototype.runAMD = function(dest, callback) {
	var p = this;
	var build = common.getCwd(p.project.repo, 'build');
	var buildStatic = path.join(destRoot, 'static');
	util.runAMD(p.project, buildStatic, cb);
	// 压缩
	// 打版本
	// 输出到production/static目录
};

// 替换config.js里的paths
Production.prototype.buildConfigFile = function(callback) {
	// TODO
};

Production.prototype.run = function(commit, callback) {
	var p = this;
	p.exist(commit, function(err, exist) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			return p.checkout(commit, callback);
		} else {
			debug('开始发布...');
			// 签出源码 > 编译&输出 > 提交到版本库 > 标记为已发布
			
			var checkAMD = function() {
				var next = arguments[arguments.length - 1];
				util.hasAMD(p.project, function(err, ret){
					hasAMD = ret;
					debug('hasAMD=', ret);
					next(err, ret);
				});
			};

			var checkout = function() {
				debug('checkout ', arguments);
				var next = arguments[arguments.length - 1];
				async.waterfall([
					function(cb) {
						util.getProject(p.project, commit, function(){
							cb();
						});
					},
					util.getSource.bind(null, p.project, commit)
				], next);
			};

			var compile = function(source) {
				debug('compile ', arguments);
				var next = arguments[arguments.length - 1];
				var destRoot = common.getCwd(p.project.repo, 'production');
				var dest = path.join(destRoot, 'static');
				console.log('输出静态资源：%s', dest);
				async.series([
					function(cb) {
						p.resource(source, cb);
					},
					function(cb) {
						p.runAMD(dest, cb);
					},
					function(cb) {
						p.buildConfigFile(cb);
					},
					function(cb){
						p.html(source, cb);
					}
				], next);
			};

			var save = function(){
				debug('save');
				var next = arguments[arguments.length - 1];
				p.commit(commit, next);
			};

			var getHeadCommit = function() {
				debug('getHeadCommit');
				var next = arguments[arguments.length - 1];
				var git = new Git(p.project.repo, {
					type: 'production'
				});
				git.getHeadCommit(function(err, data) {
					var args = {
						type: 'production',
						src: commit,
						dest: data,
						repo: p.project.repo
					}
					next(null, args);
				});
			};

			var mark = function(data) {
				debug('mark', arguments);
				var next = arguments[arguments.length - 1];
				util.mark(p.db, data, next);
			};

			var tasks = [checkAMD, checkout, compile, save, getHeadCommit, mark];
			async.waterfall(tasks, function(err, data){
				callback(err, data);
			});
		}
	});
};

module.exports = Production;

