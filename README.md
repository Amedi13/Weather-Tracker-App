Read me file (we can change this later)
**Weather tracker Application** 

**Description** 
Weather tracker App allows users to track current weather patterns as well as past weather patterns. The user will be able to see tempetures as well as future tempeture for the enxt upcoming days. 

**Python**
1. Make sure you have python installed. If not go here [https://www.python.org/downloads/] to install it and set up in your evironmental variables. 

2. To verify it successfully installed open up a new terminal window and run [py --version] or [python --version] (which ever works)

**Virtual Environment** 
Note: For this project I recommend to set up a virtual environment so that whenever you install django its not on your global machine.

1. Open up a new terminal window and run [pip install virtualenv] Remember the file path for this. 

2. to verify the Virtual Environment was installed succesfully navigate to the path where the virtualenv was intalled if not there already and run .\env\Scripts\Activate

**Backend Set Up (Django)**

1. Make sure you are in the Virtual Environment, and run [pip install django] in a terminal window

2. Next you will need to run [django-admin startproject "insert-project-name-here"] give the project a name. 

3. to start the server navigate to the directory you made in the previous step and run [py manage.py runserver]

4. http://127.0.0.1:8000/ if you see that url you did everything correctly 
