**Weather tracker Application** 

**Description** 
The Weather Tracker App allows users to view current weather conditions and review historical data. It also provides forecasts for upcoming days, including temperature trends and other key weather details.

**Python**
1. Make sure you have python installed. If not go here [https://www.python.org/downloads/] to install it and set up in your evironmental variables. 

2. To verify it successfully installed open up a new terminal window and run `py --version` or `python --version` (which ever works)

**Clone the Repository**
Note: In a directory of your choice do the following steps

1. `git clone https://github.com/Amedi13/Weather-Tracker-App.git`

2. `cd Weather-Tracker-App` 

3. You should now be in the project root
    `weather-tracker-app` 

**Virtual Environment** 
Note: It’s recommended to use a virtual environment so dependencies don’t install globally.

Note: To Avoid confusion, the virtual environment should always be created inside 'wt-services' so everyone knows where it lives

1. `cd wt-services` 

2. create the virtual enviroment `py -m venv env`

3. Activate it `.\env\Scripts\Activate`

⚠️ Important:
- Always activate the environment before installing packages or running the server.
- Do not create multiple environments in different folders — always use wt-services/env.  (only need to do this once)

**Backend Set Up (Django)**
Note: Make sure the virtual environment is active ((env) is showing).
Note: Install Django and any dependencies (first time only):

1. `pip install django`

2. `cd wt-services`

3. `py manage.py runserver`

3. Open your browser and go to:
    `http://127.0.0.1:8000/`
    If you see the Django welcome page or your Weather Tracker app, everything is set up correctly ✅.


**Frontend Set up (React)**
Note: From any directory of your choice do the following. 
Note: run the follwoing commands

1. `node -v` 

2. `npm -v`

- If either one fails downliad node.js from here https://nodejs.org/en 

    **Create the react App**

    1. `cd Weather-Tracker-App`

    2. npx create-react-app frontend

    3. `cd frontend`

    4. `npm start`

-You should see the React starter page at http://localhost:3000
Leave this terminal running while you work on React.