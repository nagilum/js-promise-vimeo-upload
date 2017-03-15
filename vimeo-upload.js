'use strict';

/**
 * Upload a video to Vimeo.
 * @param {string} accessToken 
 * @param {Blob} blob 
 * @param {Object} videoProperties 
 * @returns {Object}
 */
var vimeoUpload = function (accessToken, blob, videoProperties) {
  return new Promise(function (resolve) {
    resolve({
      accessToken: accessToken,
      blob: blob,
      totalLength: blob.size,
      videoProperties: videoProperties
    });
  })
  .then(function (payload) {
    // Get upload ticket.
    return fetch('https://api.vimeo.com/me/videos', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + payload.accessToken,
        'Accept': 'application/vnd.vimeo.*+json; version=3.2',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        'type': 'streaming'
      })
    })
    .then(function (res) {
      if (res.status !== 200) {
        throw new Error(res.statusText);
      }

      payload.ticket = res.json();

      return payload;
    })
    .catch(function (err) {
      throw err;
    });
  })
  .then(function (payload) {
    // Cycle upload and progress check.
    payload.currentPos = 0;
    payload.uploadComplete = false;

    var sendChunksOfBytesToVimeo = function (payload) {
      return new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();

        xhr.open('PUT', payload.ticket.upload_link_secure, true);
        xhr.setRequestHeader('Content-Type', payload.blob.type);
        xhr.setRequestHeader('Content-Range', 'bytes ' + payload.currentPos + '-' + payload.totalLength + '/' + payload.totalLength);

        xhr.onload = function () {
          payload.uploadComplete = true;
          resolve(payload);
          return;
        };

        xhr.onerror = function () {
          resolve(payload);
          return;
        };

        xhr.send(payload.blob);
      })
      .then(function (payload) {
        if (payload.uploadComplete) {
          return payload;
        }

        return fetch(payload.ticket.upload_link_secure, {
          method: 'PUT',
          headers: {
            'Content-Type': payload.blob.type,
            'X-Upload-Content-Type': payload.blob.type,
            'Content-Range': 'bytes */*'
          }
        })
        .then(function (res) {
          if (!res.headers || !res.headers.range) {
            throw new Error('Vimeo PUT progress check returned invalid response.');
          }

          var range = res.headers.range,
              rnsep = range.indexOf('-');
          
          payload.currentPos = parseInt(range.substr(rnsep + 1), 10);

          if (payload.currentPos >= payload.totalLength) {
            payload.uploadComplete = true;
            return payload;
          }

          return sendChunksOfBytesToVimeo(payload);
        })
        .catch(function (err) {
          throw err;
        });
      })
      .catch(function (err) {
        throw err;
      });
    };

    return sendChunksOfBytesToVimeo(payload);
  })
  .then(function (payload) {
    // Mark upload as completed.
    return fetch(payload.ticket.complete_uri, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + payload.accessToken,
        'Accept': 'application/vnd.vimeo.*+json; version=3.2',
        'Content-Type': 'application/json; charset=utf-8'
      }
    })
    .then(function (res) {
      if (res.status !== 200) {
        throw new Error(res.statusText);
      }

      payload.location = res.headers.location;
      payload.videoID = payload.location.substr(payload.location.lastIndexOf('/') +1)

      return payload;
    })
    .catch(function (err) {
      throw err;
    });
  })
  .then(function (payload) {
    // Update video with properties.
    if (!payload.videoProperties) {
      return payload;
    }

    return fetch(payload.location, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + payload.accessToken,
        'Accept': 'application/vnd.vimeo.*+json; version=3.2',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload.videoProperties)
    })
    .then(function (res) {
      if (res.status !== 200) {
        throw new Error(res.statusText);
      }

      return payload;
    })
    .catch(function (err) {
      throw err;
    });
  })
  .then(function (payload) {
    // Get video metadata.
    return fetch('https://api.vimeo.com/me/videos/' + payload.videoID, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + payload.accessToken,
        'Accept': 'application/vnd.vimeo.*+json; version=3.2',
        'Content-Type': 'application/json; charset=utf-8'
      }
    })
    .then(function (res) {
      if (res.status !== 200) {
        throw new Error(res.statusText);
      }

      return res.json();
    })
    .catch(function (err) {
      throw err;
    });
  })
  .catch(function (err) {
    throw err;
  });
};