import React from 'react';
import axios from 'axios';

class App extends React.Component {
  state = {
    details: [], 
  }

  /**
   * Locql backend server and fetch data from there
   */
  componentDidMount() {
    axios.get('http://127.0.0.1:8000/api/datasets/?limit=3')
      .then(res => {
        this.setState({ details: res.data.results || [] });
      })
      .catch(err => {
        console.error(err);
      });
  }

  render() {
    return (
      <div>
        {this.state.details.map((detail, index) => (
          <h2 key={index}>{detail.name}</h2> 
        ))}
      </div>
    )
  }
}

export default App;