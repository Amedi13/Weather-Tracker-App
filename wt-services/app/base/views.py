from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import React
from .serializer import ReactSerializer


#GET, POST PUT, DELETE operations will be defined here

@api_view(['GET'])
def getData(request): 
    items = React.objects.all()
    serializer = ReactSerializer(items, many=True) 
    return Response(serializer.data)

@api_view(['POST'])
def postData(request):
    items = React.objects.all()
    serializer = ReactSerializer(items, many=True)
    return Response(serializer.data)