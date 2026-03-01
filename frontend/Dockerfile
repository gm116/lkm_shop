FROM node:20.18.0

WORKDIR /app/frontend

COPY frontend/package*.json /app/frontend/
RUN npm install

COPY frontend /app/frontend

EXPOSE 3000

CMD ["npm", "start"]
