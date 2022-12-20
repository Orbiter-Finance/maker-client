FROM node:16.15
RUN mkdir -p /home/maker-client
WORKDIR /home/maker-client
COPY ./ .
RUN node -v
RUN yarn add
# RUN apt-get update
# RUN apt-get install -y vim
# RUN yarn config set ignore-engines true
# RUN yarn install --network-timeout 600000
# RUN yarn run build:maker
# EXPOSE 8001
CMD ["node","./dist/index.js"]
# docker build -t maker-client:v1 .
