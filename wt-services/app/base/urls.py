from django.urls import path 
from . import views

# HTTP operations are routed here

urlpatterns =[
    path('', views.getData),
    path("api/datasets/", views.getData, name="datasets"), # <-- use views.getData here
    path("api/data/", views.weather_data, name="weather-data"),
    #path('', views.postData)
]