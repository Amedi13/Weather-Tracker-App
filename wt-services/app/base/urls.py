from django.urls import path 
from . import views

# HTTP operations are routed here

urlpatterns = [
    path('', views.getData),
    path('api/locations/', views.get_locations),
    path('api/data/', views.weather_data),
    path('api/trends/', views.trends),
    path('api/forecast/daily', views.daily_forecast),   # <-- NEW (OWM aggregated daily)
    path('api/nws', views.nws),                         # <-- NEW (NOAA daily)
    path('api/alerts/', views.alerts, name='alerts'),
    path('api/map-html/', views.get_map_html),  # New route for map HTML
]