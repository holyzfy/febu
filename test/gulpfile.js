var gulpfile = require('../gulpfile.js').debug;
var should = require('should');
var async = require('async');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	it('formatCommit', function(done){
		async.parallel([
			function(callback) {
				var commit = '3bc6453';
				gulpfile.formatCommit(repo, commit, function(err, data) {
					if(err) {
						return callback(err);
					}
					commit.should.equal(data);
					callback();
				});
			},
			function(callback) {
				gulpfile.formatCommit(repo, 'HEAD', function(err, data) {
					if(err) {
						return callback(err);
					}
					'HEAD'.should.not.equal(data);
					should.exist(data);
					callback();
				});
			}
		], done);

	});
});

