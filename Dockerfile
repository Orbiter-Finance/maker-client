FROM node:lts-alpine
WORKDIR /app

COPY package.json .
RUN yarn install --network-timeout 600000
COPY ./ .
RUN yarn run postinstall

RUN yarn run build
EXPOSE 3002
CMD ["node","./packages/mtx/dist/index.js"]
