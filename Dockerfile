# 构建阶段
FROM node:18 AS build
WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn config set ignore-engines true
RUN yarn install --network-timeout 600000

COPY . .
RUN yarn build

# 生产阶段
FROM node:18 AS production
WORKDIR /app
EXPOSE 3001
# COPY --from=build /app/package.json /app/yarn.lock ./
# COPY --from=build /app/dist ./dist
COPY --from=build /app/ ./
CMD [ "npm", "run", "start:prod" ]
