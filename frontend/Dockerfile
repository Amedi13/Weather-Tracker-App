# Instructions to build the frontend Docker image 

#Use an official Node.js runtime as a parent image
FROM node:20-alpine

#Set the working directory in the container
WORKDIR /frontend

#Copy package.json and package-lock.json to the working directory
COPY package*.json ./

#Install the project dependencies
RUN npm install 

#Copy the rest of the application code to the working directory
COPY . .

#Set the port number the container will listen on
EXPOSE 3000

#Start the application
CMD ["npm", "start"]