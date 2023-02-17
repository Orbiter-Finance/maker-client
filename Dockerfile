FROM node:16.15
RUN apt-get update

WORKDIR /home/maker-client

COPY package.json yarn.lock ./
RUN yarn config set ignore-engines true
RUN yarn install --network-timeout 600000

COPY ./ .
RUN yarn run build:maker

EXPOSE 8000
CMD ["node","./build/maker-service/index.js"]
