#Instructions to start building the Backend Docker image

#Use an official Python runtime as a parent image
FROM python:3.12-slim

#Set the Working directory in the container
WORKDIR /wt-services

#Copy the requirements file to the working directory
COPY requirements.txt ./

#Install the project dependencies
RUN pip install -r requirements.txt

#Copy the rest of the application code to the working directory
COPY . .

#Set the port number the container will listen on and run
CMD ["gunicorn", "app.wsgi:application", "--bind", "0.0.0.0:8000"]