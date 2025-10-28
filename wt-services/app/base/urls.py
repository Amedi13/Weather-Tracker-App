from django.urls import path 
from . import views

# HTTP operations are routed here

urlpatterns =[
    path('', views.getData),
    path('api/data/', views.weather_data),
    path('api/locations/', views.get_locations),
    #path('', views.postData)
]