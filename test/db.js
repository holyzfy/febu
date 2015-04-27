var db = require('../module/db.js');
var should = require('should');
var debug = require('debug')('febu:' + __filename);

describe(__filename, function(){
	var repo = 'test_repo_url';

	before(function(done){
		db.init(done);
	});

	it('db.projects.save', function(done){
		var project = {
			repo: repo,
			development: {
				ftp: '',
				web: '//qa.developer.163.com/'
			},
			production: {
				ftp: '',
				web: '//img1.cache.netease.com/f2e/'
			},
			version: '3bc6453'
		};
		db.projects.save(project, done);		
	});
	
	it('db.projects.find', function(done) {
		db.projects.find(repo, function(err, ret){
			should.not.exist(err);
			should.exist(ret);
			done();
		});
	});

	it('db.projects.remove', function(done) {
		var conditions = {
			repo: repo
		};
		db.projects.remove(conditions, done);
	});
	
});