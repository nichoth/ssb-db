

var level     = require('level-test')()
var pull      = require('pull-stream')
var ecc       = require('eccjs')
var tape      = require('tape')

var SBS       = require('../')
var u         = require('../util')
var replicate = require('../replicate')

var codec     = require('../codec')

//create a instance with a feed
//then have another instance follow it.

function rand (n) {
  var a = []
  while(n--)
    a.push(Math.random())
  return a
}

function create(name) {
  return SBS(level(name, {
    keyEncoding: codec, valueEncoding: codec
  }))
}

var MESSAGE = new Buffer('message')

function init (sbs, n, cb) {
  var keys = ecc.generate(ecc.curves.k256)
  var f = sbs.feed(keys)
  pull(
    pull.values(rand(n)),
    pull.asyncMap(function (r, cb) {
      f.append(MESSAGE, ''+r, cb)
    }),
    pull.drain(null, function (err) {
      if(err) return cb(err)
      f.verify(cb)
    })
  )
  return keys
}

tape('unit - vector', function (t) {
  var sbs1 = create('sbs-unittest-vector')
  var keys = init(sbs1, 0, function (err) {
    if(err) throw err
    replicate.vector(sbs1, function (err, vector) {
      t.deepEqual(vector, [{id: u.bsum(keys.public), sequence: 1}])

      //this means they do not want anything.
      pull(
        replicate.feeds(sbs1, vector, [{id: u.bsum(''), sequence: 1}]),
        pull.collect(function (err, ary) {
          console.log(ary)
          if(err) throw err
          t.end()
        })
      )
    })
  })
})

function compareDbs (a, b, cb) {

  var cbs = u.groups(next)

  pull(a.createFeedStream(), pull.collect(cbs()))
  pull(b.createFeedStream(), pull.collect(cbs()))

  function next(err, ary) {
    cb(err, ary && ary[0], ary && ary[1])
  }
}

tape('simple replicate', function (t) {

  var sbs1 = create('sbs-replicate1')
  var sbs2 = create('sbs-replicate2')

  var cb1 = u.groups(done)

  init(sbs1, 5, cb1())
  init(sbs2, 4, cb1())

  var ary = [], n = 1

  function done (err) {
    if(err) throw err
    var cb2 = u.groups(done2)

    var a = replicate(sbs1, cb2())
    var b = replicate(sbs2, cb2())

    pull(a, pull.through(function (e) {ary.push(e)}), b, a)

    function done2 (err) {
      if(err) throw err
      //now check that the databases have really been updated.

      var cbs = u.groups(next)

      pull(sbs1.createFeedStream(), pull.collect(cbs()))
      pull(sbs2.createFeedStream(), pull.collect(cbs()))

      function next (err, ary) {
        if(err) throw err

        t.deepEqual(ary[0], ary[1])

        console.log('replicated!!!')
        t.end()
      }
    }
  }
})

return
tape('3-way replicate', function (t) {

  var sbs1 = create('sbs-3replicate1')
  var sbs2 = create('sbs-3replicate2')
  var sbs3 = create('sbs-3replicate3')

  var cb1 = u.groups(done)

  init(sbs1, 10, cb1())
  init(sbs2, 15, cb1())
  init(sbs3, 20, cb1())

  var ary = []

  function done (err) {
    if(err) throw err
    var cb2 = u.groups(done2)

    var a = replicate(sbs1, cb2())
    var b = replicate(sbs2, cb2())

    pull(a, b, a)

    function done2 (err) {
      if(err) throw err
      //now check that the databases have really been updated.

      var cb3 = u.groups(done3)

      var c = replicate(sbs3, cb3())
      var d = replicate(sbs2, cb3())

      pull(c, d, c)

      function done3 (err) {
        if(err) throw err

        var cbs = u.groups(next)

        pull(sbs2.createFeedStream(), pull.collect(cbs()))
        pull(sbs3.createFeedStream(), pull.collect(cbs()))

        function next (err, ary) {
          if(err) throw err

          t.deepEqual(ary[0], ary[1])

          console.log('replicated!!!')
          t.end()
        }
      }
    }
  }
})
