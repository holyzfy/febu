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

function getProject() {
	return {
		repo: argv.repo,
		branch: argv.branch || 'master',
		publicPath: argv.publicPath
	};
}

gulp.task('before', function(callback){
	if(!argv.repo) {
		return callback('请输入仓库地址，参数--repo');
	}

	var timer;
	var src = common.getCwd(argv.repo, 'src');
	var project = getProject();
	var git = new Git(argv.repo);

	var clone = function(cb) {
		git.clone(function() {
			// ignore error when destination path already exists and is not an empty directory
			cb();
		});
	};

	var tasks = [
		clone,
		git.fetch.bind(git, ['origin', project.branch]),
		git.checkout.bind(git, project.branch),
		git.exec.bind(git, 'merge', 'origin/' + project.branch)
	];
	async.series(tasks, function(err) {
		clearTimeout(timer);
		callback(err);
	});

	timer = setTimeout(function() {
		callback('发布超时，请稍后重试');
	}, 240000);
});

gulp.task('clean', function(done){
	del([common.getCwd(argv.repo, 'build')], {
		force: true
	}).then(function() {
		done();
	});
});

gulp.task('development', gulp.series('before', 'clean', function main(callback){
	var dev = new Development(getProject());
	dev.run(argv.commit || 'HEAD', callback);
}));

gulp.task('production', gulp.series('before', 'clean', function main(callback){
	var p = new Production(getProject());
	p.run(argv.commit || 'HEAD', callback);
}));
