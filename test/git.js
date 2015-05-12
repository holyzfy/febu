var path = require('path');
var Git = require('../module/git.js');
var debug = require('debug')('febu:' + __filename);
var fs = require('fs-extra')
var should = require('should');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';
	var git = new Git(repo);
	var p = '__test_init';

	before(function(done){
		fs.mkdirs(p, done);
	});

	after(function(done) {
		fs.remove(p, done);
	})

	it('repo url', function(){
		repo.should.equal(git.url);
	});

	it('init', function(done) {
		var git = new Git(repo, {
			cwd: p
		});
		git.init(function(error){
			if(error) {
				return done(error);
			}
			var gitDir = path.join(p, '.git');
			fs.exists(gitDir, function(ret) {
				should.exist(ret);
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

			try {
				should.not.exist(err);
				should.deepEqual(ret, expected);
				done();
			} catch(err) {
				done(err);
			}
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
			try {
				// debug(data);
				should.deepEqual(data, expected);
				done();
			} catch(e) {
				done(e);
			}
		});
	});

	it('getHeadCommit', function(done) {
		git.getHeadCommit(function(err, data) {
			try {
				should.exist(data);
				done();
			} catch(e) {
				done(e);
			}
		});
	});
});