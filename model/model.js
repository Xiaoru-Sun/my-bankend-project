const db = require("../db/connection");
const format = require("pg-format");
const testData = require("../db/data/test-data/index.js");
const devData = require("../db/data/development-data/index.js");
const { query } = require("express");

function fetchTopics() {
  return db.query(`SELECT * FROM topics;`).then(({ rows }) => {
    return rows;
  });
}

function fetchArticleById(article_id) {
  const sqlStr = `SELECT filtered.*, CAST (COUNT(comments.body) AS INT) as comment_count
    FROM (
        SELECT * FROM articles 
        WHERE article_id = $1) AS filtered
    LEFT JOIN comments ON comments
    .article_id = filtered.article_id
    GROUP by filtered.article_id, filtered.title, filtered.topic, filtered.author, filtered.body, filtered.created_at, filtered.votes, filtered.article_img_url;`;
  return db.query(sqlStr, [article_id]).then(({ rows }) => {
    if (rows.length === 0) {
      return Promise.reject({
        status: 404,
        msg: "Not found, article_id does not exist",
      });
    }
    return rows[0];
  });
}

function fetchArticles(
  topic,
  sort_by = "created_at",
  order = "DESC",
  limit = 10,
  p
) {
  const validTopics = testData.topicData
    .map((obj) => obj.slug.toUpperCase())
    .concat(devData.topicData.map((obj) => obj.slug.toUpperCase()));
  const validSortBys = [
    "TITLE",
    "TOPIC",
    "AUTHOR",
    "CREATED_AT",
    "VOTES",
    "COMMENT_COUNT",
  ];
  const validOrders = ["DESC", "ASC"];

  if (topic === undefined) {
    let sqlStr = `SELECT articles.author, articles.title, articles.article_id, articles.topic, articles.created_at, articles.votes, articles.article_img_url, CAST (COUNT(comments.body) AS INT) as comment_count
        FROM articles
        LEFT JOIN comments ON articles.article_id = comments.article_id
        GROUP BY articles.article_id`;

    if (
      !validSortBys.includes(sort_by.toUpperCase()) ||
      !validOrders.includes(order.toUpperCase())
    ) {
      return Promise.reject({
        status: 400,
        msg: "Bad request",
      });
    } else {
      sqlStr += ` ORDER BY ${sort_by} ${order}`;
      if (p) {
        sqlStr += ` LIMIT $1 OFFSET ($2 - 1) * $3;`;
        return db.query(sqlStr, [limit, p, limit]).then(({ rows }) => {
          return rows;
        });
      } else {
        sqlStr += ";";
        return db.query(sqlStr).then(({ rows }) => {
          return rows;
        });
      }
    }
  } else {
    if (!validTopics.includes(topic.toUpperCase())) {
      return Promise.reject({
        status: 404,
        msg: "Topic not found",
      });
    } else {
      const sqlStr = format("SELECT * FROM %I WHERE topic = $1;", "articles");
      return db.query(sqlStr, [topic]).then(({ rows }) => {
        return rows;
      });
    }
  }
}

function fetchCommentsByArticleId(article_id, limit = 10, p) {
  let sqlStr = `SELECT * FROM comments
    WHERE article_id = $1
    ORDER BY created_at DESC
    LIMIT $2`;
  if (!p) {
    sqlStr += ";";
    return db.query(sqlStr, [article_id, limit]).then(({ rows }) => {
      return rows;
    });
  } else {
    sqlStr += ` OFFSET ($3 - 1 ) * $4;`;
    return db.query(sqlStr, [article_id, limit, p, limit]).then(({ rows }) => {
      return rows;
    });
  }
}

function doesArticleExist(article_id) {
  const sqlStr = `SELECT * FROM articles WHERE article_id = $1;`;
  return db.query(sqlStr, [article_id]).then(({ rows }) => {
    if (rows.length === 0) {
      return Promise.reject({
        status: 404,
        msg: "Article_id not found!",
      });
    }
  });
}

function insertCommentsByArticleId(article_id, username, body) {
  const queryVals = [body];
  const validUserNames = testData.userData
    .map((user) => user.username)
    .concat(devData.userData.map((user) => user.username));
  if (!validUserNames.includes(username)) {
    return Promise.reject({
      status: 404,
      msg: "Username is not found",
    });
  } else {
    queryVals.push(username);
  }
  queryVals.push(article_id);

  const sqlStr = format(
    `INSERT INTO %I
    (body, author, article_id)
    VALUES %L RETURNING *;`,
    "comments",
    [queryVals]
  );

  return db.query(sqlStr).then(({ rows }) => {
    return rows[0];
  });
}

function updateArticleById(article_id, inc_votes) {
  const sqlStr = `UPDATE articles SET votes = votes + $1 WHERE article_id = $2 RETURNING *;`;
  return db.query(sqlStr, [inc_votes, article_id]).then(({ rows }) => {
    return rows[0];
  });
}

function deleteCommentById(comment_id) {
  const sqlStr = "DELETE FROM comments WHERE comment_id = $1 RETURNING *;";
  return db.query(sqlStr, [comment_id]).then(({ rows }) => {
    if (rows.length === 0) {
      return Promise.reject({
        status: 404,
        msg: "Comment_id not found",
      });
    }
  });
}

function fetchUsers(username) {
  const validUserNames = testData.userData.map((obj) => obj.username);
  let sqlStr = "SELECT * FROM users";
  if (!username) {
    sqlStr += ";";
    return db.query(sqlStr).then(({ rows }) => {
      return rows;
    });
  } else {
    if (!validUserNames.includes(username)) {
      return Promise.reject({
        status: 404,
        msg: "Username not found!",
      });
    } else {
      sqlStr += " WHERE username = $1;";
      return db.query(sqlStr, [username]).then(({ rows }) => {
        return rows[0];
      });
    }
  }
}

function updateCommentById(comment_id, inc_votes) {
  const sqlStr = `UPDATE comments SET votes = votes + $1 WHERE comment_id = $2 RETURNING *;`;
  return db.query(sqlStr, [inc_votes, comment_id]).then(({ rows }) => {
    if (rows.length === 0) {
      return Promise.reject({
        status: 404,
        msg: "Comment_id not found",
      });
    }
    return rows[0];
  });
}

function insertArticles(author, topic, body, title) {
  const queryVals = [];
  const allTopics = testData.topicData.concat(devData.topicData);
  const allAuthors = testData.userData.concat(devData.userData);
  const validTopics = allTopics.map((topicObj) => topicObj.slug);
  const validAuthors = allAuthors.map((authorObj) => authorObj.username);
  if (!validAuthors.includes(author) || !validTopics.includes(topic)) {
    return Promise.reject({
      status: 400,
      msg: "Bad request",
    });
  } else {
    queryVals.push(title);
    queryVals.push(topic);
    queryVals.push(author);
    queryVals.push(body);

    const sqlStr = format(
      `INSERT INTO articles (title, topic, author, body) VALUES %L RETURNING *, 0 AS comment_count;`,
      [queryVals]
    );
    return db.query(sqlStr).then(({ rows }) => {
      return rows[0];
    });
  }
}

function insertTopics(slug, description) {
  let sqlStr = format(
    "INSERT INTO topics (slug, description) VALUES %L RETURNING *;",
    [[slug, description]]
  );
  return db.query(sqlStr).then(({ rows }) => {
    return rows[0];
  });
}

function deleteArticleById(article_id) {
  const sqlStr = "DELETE FROM articles WHERE article_id = $1 RETURNING *;";
  return db.query(sqlStr, [article_id]).then(({ rows }) => {
    if (rows.length === 0) {
      return Promise.reject({
        status: 404,
        msg: "Article_id not found",
      });
    }
  });
}

module.exports = {
  fetchTopics,
  fetchArticleById,
  fetchArticles,
  fetchCommentsByArticleId,
  doesArticleExist,
  insertCommentsByArticleId,
  updateArticleById,
  deleteCommentById,
  fetchUsers,
  updateCommentById,
  insertArticles,
  insertTopics,
  deleteArticleById,
};
