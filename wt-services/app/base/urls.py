from django.urls import path 
from . import views

# HTTP operations are routed here

urlpatterns =[
    path('', views.getData),
    #path('', views.postData)
]