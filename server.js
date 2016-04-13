require('env2')('config.env');
var request = require('request'),
	express = require('express'),
	compression = require('compression'),
	Twitter = require('twitter'),
	cors = require('cors'),
	nodemw = require('nodemw'),
	http = require('http'),
	https = require('https');

var app = express();                 // define our app using express

var WIKI_ADDR = 'https://wiki.nuitdebout.fr/api.php';

//var port = process.env.PORT || 3000;        // set our port
var port = 3000;

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

//app.use(function(req, res, next) {
//  res.setHeader("Access-Control-Allow-Origin", "http://www.nuitdebout.fr");
//  return next();
//});

app.use(compression());

// Varnish header
app.all('*', function(req, res, next) {
	res.header('Cache-Control', 'public, max-age=120');
	next();
});

router.get('/bambuser', function(req, res) {
	var options = {
		uri: 'http://api.bambuser.com/broadcast.json',
		qs: {
			api_key: process.env.BAMBUSER_APIKEY,
			tag: 'NuitDeboutLive',
			type: 'live'
		}
	}

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			body = JSON.parse(body);
			if (body.result && !body.result.length) {
				delete options.qs.type;
				request(options, function (error, response, body) {
					if (!error && response.statusCode == 200) {
						res.json(body);
					}
				});
			} else {
			res.json(body);
			}
		}
	});
});


router.get('/facebook', function (req, res) {
	var options = {
		uri: 'https://graph.facebook.com/1707017119576184/posts',
		qs: {
			access_token: process.env.FACEBOOK_ACCESS_TOKEN,
			fields: 'message,caption,full_picture,link'
		}
	}

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			body = JSON.parse(body);
			res.setHeader('Content-Type', 'application/json');
			res.json(body);
		}
	});
});

router.get('/twitter', function (req, res) {
	var client = new Twitter({
		consumer_key: process.env.TWITTER_CONSUMER_KEY,
		consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
		access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
		access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
	});

	var params = {screen_name: 'nuitdebout'};
	client.get('statuses/user_timeline', params, function (error, tweets, response) {
		if (!error) {
			res.json(tweets);
		}
	});
});

// Wiki API code.
// Some documentation:
// The following calls are about AGS.
// /wiki/api/City/lastCR -> Get the last 'Compte Rendu'
// /wiki/api/City/allCR -> Get all the 'Compte Rendus'
function	getCRcontent() {
	url = titles.pop();

	https.get(WIKI_ADDR + "?action=query&prop=revisions&rvprop=content&format=json&titles=" + url.replace(/ /g, "_"), function(res) {
		var chunks = '';
		res.on('data', function(d) {
			chunks += d;
		});
		res.on('end', function() {
			responses.push(chunks);
			if (titles.length)
				getCRcontent(titles);
			else {
				return responses;
			}
		});
	});
}
var wiki_client = new nodemw({
  server: 'wiki.nuitdebout.fr',  // host name of MediaWiki-powered site
  path: '/',                  // path to api.php script
  debug: true                 // is more verbose when set to true
});

router.get('/wiki/cities', function(req, res) {
   var cities = [];
   wiki_client.getArticle('Villes', function(err, article) {
     var matches = article.match(/\[\[([^\]]+)/g).forEach(function(city) {
       city = city.replace('[[', '');
       var pieces = city.split('|')
         , uri = pieces[0]
         , label = pieces[1];
       cities.push({
         uri: uri,
         url: 'https://wiki.nuitdebout.fr/index.php?title='+uri,
         label: label
       });
     });
     res.json(cities);
   });
 });

 router.get('/wiki/last_crs', function(req, res) {
   var yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);

   wiki_client.getRecentChanges(yesterday.getTime(), function(err, changes) {
     var titles = []
       , matches = [];
     changes.forEach(function(change) {
       if (change.type == 'new' && (change.title.match(/Villes\/.*\/CR/g) || change.title.match(/Villes\/.*\/AG/g))) {
         var label, city;
         if (matches = /^Villes\/([^\/]+)/g.exec(change.title)) {
           city = matches[1];
         }
         if (matches = /.*\/(.*)$/g.exec(change.title)) {
           label = matches[1];
         }
         if (city && label) {
           titles.push({
             url: 'https://wiki.nuitdebout.fr/index.php?title='+change.title,
             city: city,
             label: label
           });
         }
       }
     });
     res.json(titles);
   })
 });

router.get('/wiki/*', function(req, res) {
	var		result = [];

  var		responses = [];
  var		titles = [];
	res.setHeader('Content-Type', 'application/json');
	args = req.params[0].split("/");
	ville = args[0];
	if (args[1] == "lastCR" || args[1] == "allCR") {
		var options = {
			uri: WIKI_ADDR + "?action=query&format=json&titles=Villes/"+ ville +"&prop=links&pllimit=500"
		}
		request(options, function(error, response, body) {
			if (!error) {
				body = JSON.parse(body);
				for (var i in body["query"]) {
					tmp = body["query"][i];
						for (var i in tmp) {
						tmp = tmp[i]["links"];
						for (var i in tmp) {
							if (tmp[i]["title"].indexOf("AG") > -1) {
								if (args[1] == "lastCR")
									titles[0] = tmp[i]["title"];
								else
									titles.push(tmp[i]["title"]);
							}
						}
					}
				}
				if (titles.length == 0) {
					res.json({"Error": "Ville introuvable !"});
						return 0;
				}
				getCRcontent(responses);
				var check = setInterval(function() {
					if (!titles.length && responses.length) {
						clearInterval(check);
						res.json(responses);
					}
				}, 100);
			} else {
				res.end({"Error": "Impossible de se connecter au wiki."});
			}
		});
	}
});

// Enable CORS access
var corsOptions = {
	origin: process.env.CORS_ALLOWED_URL
};

app.use(cors(corsOptions));

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
var server = app.listen(port);
server.timeout = 5000;
