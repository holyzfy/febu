var gulp = require('gulp');
var argv = require('yargs').argv;
var async = require('async');
var colors = require('colors');
var fs = require('fs-extra');
var path = require('path');
var common = require('./module/common.js');
var Git = require('./module/git.js');
var Development = require('./module/development.js');
var Production = require('./module/production.js');
var util = require('./module/util.js');

process.on('exit', code => {
	code !== 0 && console.error(colors.red('发布失败'));
});

function getProject() {
	return {
		repo: argv.repo,
		branch: argv.branch || 'master',
        dist: argv.dist,
		publicPath: argv.publicPath
	};
}

gulp.task('before', done => {
	if(!argv.repo) {
		return done('请输入仓库地址，参数--repo');
	}

	var timer;
	var project = getProject();
	var git = new Git(argv.repo);

	function clone(cb) {
		var src = common.getCwd(argv.repo, 'src');
		try {
		    fs.accessSync(path.join(src, '.git'));
		    cb();
		} catch (err) {
			git.clone(cb);
		}
	}

	var tasks = [
		clone,
        git.checkout.bind(git, '.'), // 确保本地仓库是干净的
        git.exec.bind(git, 'fetch', ['--all']),
		git.checkout.bind(git, project.branch)
	];
	async.series(tasks, err => {
		clearTimeout(timer);
		err && console.error(colors.red(err));
		done(err);
	});

	timer = setTimeout(() => done('发布超时，请稍后重试'), 30 * 60 * 1000);
});

gulp.task('clean', done => {
	util.clean(common.getCwd(argv.repo, 'build'))(done);
});

gulp.task('development', gulp.series('before', 'clean', function main(done) {
	var dev = new Development(getProject());
	dev.run(argv.commit || 'HEAD', done);
}));

gulp.task('production', gulp.series('before', 'clean', function main(done) {
	var p = new Production(getProject());
	p.run(argv.commit || 'HEAD', done);
}));
