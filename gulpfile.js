var gulp = require('gulp');
var argv = require('yargs').argv;
var async = require('async');
var common = require('./module/common.js');
var Git = require('./module/git.js');
var Development = require('./module/development.js');
var Production = require('./module/production.js');
var util = require('./module/util.js');

function getProject() {
	return {
		repo: argv.repo,
		branch: argv.branch || 'master',
		publicPath: argv.publicPath
	};
}

gulp.task('before', done => {
	if(!argv.repo) {
		return done('请输入仓库地址，参数--repo');
	}

	var timer;
	var src = common.getCwd(argv.repo, 'src');
	var project = getProject();
	var git = new Git(argv.repo);

	function clone(cb) {
		git.clone(function ignoreError() {
			cb();
		});
	}

	var tasks = [
		clone,
		git.fetch.bind(git, ['origin', project.branch]),
		git.checkout.bind(git, project.branch),
		git.exec.bind(git, 'merge', 'origin/' + project.branch)
	];
	async.series(tasks, err => {
		clearTimeout(timer);
		done(err);
	});

	timer = setTimeout(() => done('发布超时，请稍后重试'), 240000);
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
