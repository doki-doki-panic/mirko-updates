#!/bin/bash

if git diff --exit-code --quiet db/books.json
then
    echo "no changes..."
else
    git add db/*
    git commit -m "update data"
    git push
fi