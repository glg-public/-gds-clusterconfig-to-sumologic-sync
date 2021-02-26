# Container image that runs your code
FROM node:14.16-alpine3.12

RUN apk add \
  jq \
  curl \
  git \
  bash

COPY entrypoint.sh /app/.
COPY uploader/ /app/uploader/
RUN cd /app/uploader && npm install --production

# Code file to execute when the docker container starts up (`entrypoint.sh`)
ENTRYPOINT ["./app/entrypoint.sh"]
