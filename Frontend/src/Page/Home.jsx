import React from 'react'
import Landing from '../components/LandingPage'
import About from '../components/About'
import Dashboard from '../Dashboard'
import Footer from '../components/Footer'

function Home() {
  return (
    <div className=' h-screen w-screen'>
            <Landing/>
            
            <About/>
            
            <Footer/>
    </div>
  )
}

export default Home