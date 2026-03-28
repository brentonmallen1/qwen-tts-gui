import { useState } from 'react'
import { ConfigProvider } from './context/ConfigContext'
import { Layout } from './components/Layout'
import { TabNav, TabType } from './components/TabNav'
import { VoiceClone } from './components/VoiceClone'
import { VoiceDesign } from './components/VoiceDesign'
import { CustomVoice } from './components/CustomVoice'
import { Personalities } from './components/Personalities'
import { PersonalityGenerate } from './components/PersonalityGenerate'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('custom')

  return (
    <ConfigProvider>
      <Layout>
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'clone' && <VoiceClone />}
        {activeTab === 'design' && <VoiceDesign />}
        {activeTab === 'custom' && <CustomVoice />}
        {activeTab === 'personalities' && <Personalities />}
        {activeTab === 'personality-generate' && <PersonalityGenerate />}
      </Layout>
    </ConfigProvider>
  )
}

export default App
