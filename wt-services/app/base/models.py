from django.db import models

# data models will be defined here
class React(models.Model): 
    name = models.CharField(max_length=30)
    detail = models.CharField(max_length= 500)
