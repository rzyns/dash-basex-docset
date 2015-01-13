var gulp    = require('gulp'),
    _       = require('gulp-load-plugins')(),
    cheerio = _.cheerio,
    url     = require('url'),
    path    = require('path'),
    sqlite3 = require('sqlite3').verbose(),
    fs      = require('fs'),
    del     = require('del');

var root = 'basex.docset/',
    contents_folder = root + 'Contents/',
    resources_folder = contents_folder + 'Resources/',
    documents_folder = resources_folder + 'Documents/';

gulp.task('default', ['content', 'index-php', 'skins', 'assets', 'generate-index', 'plist']);

gulp.task('content', function () {
  return gulp
    .src(['html/docs.basex.org/wiki/**'])
    .pipe(cheerio({
      run: function ($, done) {
        // Each file will be run through cheerio and each corresponding `$` will be passed here.
        // Make all h1 tags uppercase
        $('a, link:not([rel=copyright]), frame, frameset, script, *[src], *[href]').each(function () {
          var $self = $(this), u;
          if ($self.attr('rel') == 'copyright') return; // preserve license links

          ['href', 'src'].map(function (attr) {
            if ($self.attr(attr) && (!/\//.test($self.attr(attr)) || /Special/.test($self.attr(attr)))) {
              // We have to add ./ because url.parse() doesn't handle ::s correctly
              $self.attr(attr, urlMap('./' + $self.attr(attr)));
            } else if ($self.attr(attr)) {
              $self.attr(attr, urlMap($self.attr(attr) || ''));
            }
          });
        });
        $('table:has(tr:contains(Signature))').prev('h2:has(span.mw-headline)').each(function () {
          record = /([-_a-z0-9]+):([-_a-z0-9]+)/i.exec($('span.mw-headline', this).text());
          $(this)
            .prepend('<a id="' + record[2] + '" name="' + record[2] + '"/>')
            .append('<a name="//apple_ref/cpp/Function/' + record[0] + '" class="dashAnchor"></a>')

        });
        done();
      }
    }))
    .pipe(_.rename({suffix: '.html'}))
    .pipe(gulp.dest(documents_folder));
});

gulp.task('index-php', function () {
  return gulp
    .src(['html/docs.basex.org/index.php*'])
    .pipe(_.rename(function (p) {
      var title = urlMap(p.basename + p.extname);

      p.dirname = 'css';
      p.basename = path.basename(title, path.extname(title));
      p.extname = path.extname(title);
      return p;
    }))
    .pipe(gulp.dest(documents_folder));
});

gulp.task('generate-index', ['content'], function () {
  if (!fs.existsSync(resources_folder + 'docSet.dsidx'))
    fs.closeSync(fs.openSync(resources_folder + 'docSet.dsidx', 'w'));

  var db = new sqlite3.Database(resources_folder + 'docSet.dsidx');
  db.run('CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);', function () {
    db.run('CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);');
  });

  return gulp
    .src([documents_folder + '**/*_Module.html'])
    .pipe(cheerio({
      run: function ($, done) {
        var stmt = 'INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES \n',
            data = [], record;

        pushData(data, {
          name: /^(.*)_Module\.html$/.exec($.file.relative)[1],
          type: 'Module',
          path: $.file.relative
        });

        $('table:has(tr:contains(Signature))').prev('h2:has(span.mw-headline)').each(function () {
          record = /([-_a-z0-9]+):([-_a-z0-9]+)/i.exec($('span.mw-headline', this).text());
          pushData(data, {
            name: record[0],
            type: 'Function',
            path: $.file.relative + '#' + record[2]
          });
        });

        stmt += data.join(',\n') + ';';

        db.run(stmt, function (err) {
          if (err) {
            console.error(err);
          }
          done();
        });

        function pushData(data, record) {
          var str;
          data.push(str = '(\'##name##\', \'##type##\', \'##path##\')'
            .replace(/(##(name)##|##(type)##|##(path)##)/g, function (match, all, name, type, path, offset, str) {
              return record[name || type || path];
            }));
        }
      }
    }));
});

gulp.task('skins', function () {
  return gulp
    .src(['html/docs.basex.org/skins/**/*'])
    .pipe(_.rename(function (p) {
      return {
        dirname: p.dirname,
        basename: p.basename,
        extname: (p.extname || '').replace(/\?.*$/, '')
      };
    }))
    .pipe(gulp.dest(documents_folder + 'skins/'));
});

gulp.task('assets', function () {
  return gulp
    .src(['html/docs.basex.org/{extensions,images}/**/*'])
    .pipe(gulp.dest(documents_folder));
});

gulp.task('plist', function () {
  return gulp
    .src(['Info.plist'])
    .pipe(gulp.dest(contents_folder));
});

gulp.task('clean', function(cb) {
  // You can use multiple globbing patterns as you would with `gulp.src`
  del(['basex.docset'], cb);
});

function urlMap(uri) {
  var parts = url.parse(uri, true), retval = '';
  if (/index\.php/.test(parts.pathname)) {
    if (/\.css$/.test(parts.query.title)) {
      retval = 'css/';
    }
    retval += parts.query && parts.query.title || '#errrror!';
  } else if (/^\.\//.test(parts.pathname)) {
    parts.pathname += '.html';
    retval = url.format(parts);
  } else if (/^\.\.\//.test(parts.pathname)) {
    delete parts.query;
    delete parts.href;
    delete parts.search;
    retval = '.' + url.resolve('/', url.format(parts));
  } else {
    retval = '#';
  }
  return retval;
}
