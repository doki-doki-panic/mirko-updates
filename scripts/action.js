const fs = require("fs/promises");
const { execFile } = require("child_process");
const axios = require("axios");
const github = require("@actions/github");
const core = require("@actions/core");
const books = require("../db/books.json");

const checkUpdates = async () => {
  const { data } = await axios
    .get(
      "https://elaenutus.mirko.ee/api/public/publications/search?orderBy=sierraIds&page=1&pageSize=5000&materialTypeTags=E_BOOK"
    )
    .then((res) => res.data);

  const dateAdded = Date.now();
  const newBooks = [];

  data.forEach((book) => {
    const found = books.find((it) => it.id === book.id);
    if (!found) {
      const o = {
        id: book.id,
        sierraId: book.sierraId,
        shortAuthor: book.shortAuthor,
        shortTitle: book.shortTitle,
        publishYear: book.publishYear,
        dateAdded,
      };
      books.push(o);
      newBooks.push(o);
    }
  });

  await fs.writeFile("./db/books.json", JSON.stringify(books, null, 2));

  if (newBooks.length) {
    const releaseBody = getReleaseBody(newBooks);
    const octokit = github.getOctokit(process.env.myToken);
    const owner = github.context.payload.repository.owner.login;
    const repo = github.context.payload.repository.name;
    const latestRelease = await octokit.rest.repos
      .getLatestRelease({
        owner,
        repo,
      })
      .catch(() => null);

    const nextTag = (Number(latestRelease?.data?.tag_name) || 0) + 1;
    const updateFileName = `${dateAdded}.json`;
    const updateFileUrl = `https://github.com/${owner}/${repo}/blob/main/db/updates/${updateFileName}`;
    await fs.writeFile(
      `./db/updates/${updateFileName}`,
      JSON.stringify(newBooks, null, 2)
    );

    execFile("./scripts/commit.sh", async (err) => {
      if (err) {
        return core.error("Could not make a commit.");
      }

      octokit.rest.repos.createRelease({
        owner,
        repo,
        tag_name: nextTag.toString(),
        name: `${newBooks.length} new book${newBooks.length > 1 ? "s" : ""}`,
        body: `${releaseBody}\n\n📁 [Update data](${updateFileUrl})`,
      });
    });
  }
};

const getReleaseBody = (books) => {
  const textLines = [];
  let totalLines = 0;
  let extraLineCount = 0;
  for (const book of books) {
    const lineItems = [`- "${book.shortTitle}"`];
    if (book.shortAuthor) {
      lineItems.push(` - ${book.shortAuthor}`);
    }
    if (book.publishYear) {
      lineItems.push(` (${book.publishYear})`);
    }
    const line = lineItems.join("");
    totalLines += line.length;
    if (totalLines < 9000) {
      textLines.push(line);
    } else {
      extraLineCount += 1;
    }
  }
  if (extraLineCount) {
    textLines.push(`- And ${extraLineCount} extra books...`);
  }
  return textLines.join("\n");
};

checkUpdates();
