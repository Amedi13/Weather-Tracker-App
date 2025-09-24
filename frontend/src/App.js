import React from 'react';
import axios from 'axios';

class App extends React.Component {
  state = {
    details: [], 
  }

  componentDidMount() {
    let data; 
    axios.get('http://127.0.0.1:8000/wel')
    .then(res=> {
      data= res.data; 
      this.setState({
        details: data
      });
    })
    .catch(err => {})
  }

  render() {
    return (
      <div>
        {this.state.details.map((detail, id) (
          <div key={id}>
            <h1>{detail.title}</h1>
            <p>{detail.description}</p>
          </div>
        ))}
      </div>
    )
  }
}
