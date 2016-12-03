var path = require('path');
var fs = require('fs-extra');
var tape = require('tape');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events');
var Git = proxyquire('../module/git.js', {
	child_process: {
		exec: sinon.stub()
				.withArgs(sinon.match.string, sinon.match.any, sinon.match.fn)
				.callsArg(1)
				.callsArg(2)
				.returns({
                    stdout: new EventEmitter(),
                    stderr: new EventEmitter()
                })
	},
	'fs-extra': {
		mkdirs: sinon.stub().callsArg(1)
	}
});

var repo = 'https://test.com/username/project';
var options = {
	type: 'development',
	cwd: __dirname
};

tape('new Git', test => {
	var git = new Git(repo, options);
	test.equal(git.url, repo);
	test.deepEqual(git.options, options);
	test.end();
});

tape('new Git2', test => {
	var git = new Git(repo);
	test.equal(git.url, repo);
	var cwd = path.resolve(__dirname, '../data/src/test.com/username_project');
	test.equal(git.options.cwd, cwd);
	test.end();
});

tape('exec', test => {
	git.exec('a command', test.end);
});

tape('exec2', test => {
	git.exec('a command', [], test.end);
});

var execBackup = Git.prototype.exec;
var git = new Git('https://test.com/username/project');

tape('clone', test => {
	Git.prototype.exec = sinon.stub().callsArg(2).returnsThis();
	git.clone(test.end);
});

tape('checkout', test => {
	Git.prototype.exec = sinon.stub().callsArg(2).returnsThis();
	git.checkout('master', test.end);
});

Git.prototype.exec = execBackup;
