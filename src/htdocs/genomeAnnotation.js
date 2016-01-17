require([
    'bluebird',
    'kb/data/genomeAnnotation',
    'thrift',
    'kb/common/session',
    'kb/common/html',
    'htdocs/utils',
    'yaml!config/config.yml'
], function (Promise, GenomeAnnotation, Thrift, fSession, html, utils, config) {
    'use strict';
    function toArray(x) {
        return Array.prototype.slice.call(x);
    }
    function showField(field, value, time) {
        var displayValue;
        if (value === undefined) {
            displayValue = '* undefined *';
        } else if (value === null) {
            displayValue = '* null * ';
        } else if (value.pop) {
            if (value.length === 0) {
                displayValue = '* empty array *';
            } else {
                displayValue = '<ol>' + value.map(function (x) {
                    return '<li>' + x + '</li>';
                }).join('\n') + '</ol>';
            }
        } else if (value === '') {
            displayValue = '* empty string *';
        } else if (typeof value === 'object') {
            var keys = Object.keys(value);
            if (keys.length === 0) {
                displayValue = '* empty object *';
            } else {
                displayValue = '<ol>' + keys.map(function (key) {
                    return '<li>' + key + ' : ' + value[key] + '</li>';
                }).join('\n') + '</ol>';
            }
        } else {
            displayValue = value;
        }
        var node = document.querySelector('#result [data-field="' + field + '"]');
        if (node) {
            toArray(node.querySelectorAll('[data-element="label"]')).forEach(function (el) {
                el.innerHTML = field;
            });
            toArray(node.querySelectorAll('[data-element="value"]')).forEach(function (el) {
                el.innerHTML = displayValue;
            });
            toArray(node.querySelectorAll('[data-element="type"]')).forEach(function (el) {
                el.innerHTML = (typeof value);
            });
            toArray(node.querySelectorAll('[data-element="time"]')).forEach(function (el) {
                el.innerHTML = String(time);
            });
        }
    }
    function showStatus(msg) {
        document.querySelector('#status').innerHTML = msg;
    }
    function showError(err) {
        if (err.type) {
            document.querySelector('#error > [data-field="type"]').innerHTML = err.type;
        }
        if (err.title) {
            document.querySelector('#error > [data-field="title"]').innerHTML = err.title;
        }
        if (err.message) {
            document.querySelector('#error > [data-field="message"]').innerHTML = err.message;
        }
        if (err.suggestion) {
            document.querySelector('#error > [data-field="suggestion"]').innerHTML = err.suggestion;
        }
        if (err.errorObject) {
            console.log('ERROR OBJECT');
            console.log(err.errorObject);
        }
    }
    var methods = [
        {
            name: 'getTaxon',
            type: 'string'
        },
        {
            name: 'getAssembly',
            type: 'string'
        },
        {
            name: 'getFeatureTypes',
            type: 'array of string '
        },
        {
            name: 'getFeatureTypeDescriptions',
            type: 'object (string -> number)'
        },
        {
            name: 'getFeatureTypeCounts',
            type: 'object (string -> number)'
        },
        {
            name: ' getFeatureIds',
            type: 'object (FeatureIdMapping)'
        }
    ];

    var objectRef = utils.getParams().objectRef;
    document.getElementById('objectRef').innerHTML = objectRef;

    var content = '<table border="1">' + methods.map(function (method) {
        return '<tr data-field="' + method.name + '">' +
            '<td data-element="label"></td>' +
            '<td data-element="value"></td>' +
            '<td data-element="type"></td>' +
            '<td data-element="time"></td>' +
            '</tr>';
    }).join('\n') + '</table>';
    document.querySelector('#result').innerHTML = content;
    try {
        showStatus('Starting...');
        var session = fSession.make({
            cookieName: config.cookieName,
            loginUrl: config.loginUrl
        });
        showStatus('Logging in...');
        session.login({
            username: config.username,
            password: config.password
        })
            .then(function (kbSession) {
                console.log('timeout is ' + config.timeout);
                return GenomeAnnotation.make({
                    ref: objectRef,
                    url: config.genomeAnnotationUrl,
                    token: kbSession.token,
                    timeout: config.timeout
                });
            })
            .then(function (genomeAnnotation) {
                showStatus('Building methods to test...');
                var start = new Date().getTime();
                var promises = methods.map(function (method) {
                    return new Promise(function (resolve, reject) {
                        showField(method.name, 'Loading...');
                        genomeAnnotation[method.name].apply(genomeAnnotation, method.args)
                            .then(function (value) {
                                var elapsed = (new Date()).getTime() - start;
                                console.log('GOT [' + method.name + ']');
                                console.log(elapsed);
                                console.log(' in ' + String(elapsed));
                                showField(method.name, value, elapsed);
                                resolve();
                            })
                            .catch(function (err) {
                                if (err instanceof GenomeAnnotation.AttributeException) {
                                    showField(method.name, '* n/a to this object *');
                                } else {
                                    showField(method.name, 'ERROR: ' + err.name + ':' + err.message);
                                }
//                                console.log('ERROR in ' + method);
//                                console.log(err);
//                                console.log(err instanceof Thrift.TException);
//                                console.log(err instanceof Thrift.TApplicationException);
//                                console.log(err instanceof Thrift.TTransportError);
//                                console.log(err instanceof Thrift.TXHRTransportError);
                                //resolve();
                                reject(err);
                            });
                    }).reflect();
                });
                showStatus('Running methods...');
                // return Promise.each(promises, function () { return true;});
                return Promise.all(promises);
            })
            .then(function () {
                showStatus('done');
            })
            .catch(function (err) {
                showStatus('done, with error');
                if (err instanceof GenomeAnnotation.ClientException) {
                    utils.showError(err);
                } else if (err instanceof Thrift.TTransportError) {
                    utils.showError(err);
                } else if (err instanceof Thrift.TException) {
                    utils.showError({
                        name: 'ThriftException',
                        reason: err.name,
                        message: err.getMessage()
                    });
                } else if (err instanceof GenomeAnnotation.AttributeException) {
                    utils.showError({
                        name: 'AttributeException',
                        reason: err.name,
                        message: 'This attribute is not supported for this object'
                    });
                } else {
                    console.log(err);
                    utils.showError({
                        type: 'UnknownError',
                        message: 'Check the browser console'
                    });
                }
            });
    } catch (ex) {
        showError(ex);
    }
});
