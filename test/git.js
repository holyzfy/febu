var path = require('path');
var Git = require('../module/git.js');
var fs = require('fs-extra');
var expect = require('expect.js');
var async = require('async');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';
	var git = new Git(repo);
	var p = path.join(__dirname, '__test_init');

	before(function(done){
		var tasks = [
			fs.remove.bind(fs, git.options.cwd),
			fs.remove.bind(fs, p),
			fs.mkdirs.bind(fs, p)
		];
		async.series(tasks, done);
	});

	after(function(done) {
		fs.remove(p, done);
	});

	it('repo url', function(){
		expect(repo).to.equal(git.url);
	});

	it('init', function(done) {
		var git = new Git(repo, {
			cwd: p
		});
		git.init(function(err){
			if(err) {
				return done(err);
			}

			var gitDir = path.join(p, '.git');
			fs.exists(gitDir, function(ret) {
				expect(ret).to.be.ok();
				done();
			});
		});
	});

	it('init 2', function(done) {
		var git = new Git(repo, {
			cwd: p
		});
		git.init(done);
	});

	it('clone', function(done){
		git.clone(done);
	});

	it('show', function(done){
		var commit = '7b11df0';
		git.show(commit, function(err, ret){
			var expected = {
				commit: commit,
				author: 'zfq',
				datetime: 1400251035000,
				message: '添加images'
			};
			expect(err).to.be(null);
			expect(ret).eql(expected);
			done();
		});
	});

	it('pull', function(done){
		git.pull(done);
	});

	it('checkout', function(done){
		git.checkout('master', done);
	});

	it('diff', function(done){
		var from = 'eae17bd';
		var to = '0b6d734';
		var expected = [
		    'images/174338a0ay2nnznr3fv116.jpg',
		    'images/logo_107.gif',
		    'images/yoko_ogura.jpg',
		    'index.html',
		    'list.html'
		];
		git.diff(from, to, function(err, data){
			expect(data).to.eql(expected);
			done();
		});
	});

	it('getHeadCommit', function(done) {
		git.getHeadCommit(function(err, data) {
			expect(data).to.be.ok();
			done();
		});
	});

});