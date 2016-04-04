var path = require('path');
var fs = require('fs-extra');
var expect = require('expect.js');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var Git = proxyquire('../module/git.js', {
	shelljs: {
		cd: sinon.spy(),
		exec: sinon.stub()
				.withArgs(sinon.match.string, sinon.match.any, sinon.match.fn)
				.callsArg(1)
				.callsArg(2)
				.returnsThis()
	},
	'fs-extra': {
		mkdirs: sinon.stub().callsArg(1)
	}
});

describe(__filename, function(){
	var repo = 'https://test.com/username/project';
	var options = {
		type: 'development',
		cwd: __dirname
	};
	var git = new Git(repo, options);

	it('new Git', function(){
		expect(git.url).to.be(repo);
		expect(git.options).to.eql(options);
	});

	it('new Git2', function(){
		var git = new Git(repo);
		expect(git.url).to.equal(repo);
		var cwd = path.resolve(__dirname, '../data/src/test.com/username_project');
		expect(git.options.cwd).to.be(cwd);
	});

	it('exec', function(done) {
		git.exec('a command', done);
	});

	it('exec2', function(done) {
		git.exec('a command', [], done);
	});
});

describe(__filename, function(){
	var execBackup = Git.prototype.exec;
	var git = new Git('https://test.com/username/project');

	it('clone', function(done){
		Git.prototype.exec = sinon.stub().callsArg(2).returnsThis();
		git.clone(done);
	});

	it('fetch', function(done){
		Git.prototype.exec = sinon.stub().callsArg(1).returnsThis();
		git.fetch(done);
	});

	it('fetch with args', function(done){
		Git.prototype.exec = sinon.stub().callsArg(2).returnsThis();
		var args = ['origin', 'rbranch:lbranch'];
		git.fetch(args, done);
	});

	it('checkout', function(done){
		Git.prototype.exec = sinon.stub().callsArg(2).returnsThis();
		git.checkout('master', done);
	});

	Git.prototype.exec = execBackup;
});