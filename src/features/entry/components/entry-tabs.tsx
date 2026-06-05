import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEntry, type EntryTab } from './entry-provider'
import { FullTestsTable } from './full-tests-table'
import { PartTestsTable } from './part-tests-table'

export function EntryTabs() {
  const { activeTab, setTab, search, navigate } = useEntry()

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setTab(value as EntryTab)}
      className='flex-1'
    >
      <TabsList>
        <TabsTrigger value='part_tests'>Part Tests</TabsTrigger>
        <TabsTrigger value='full_tests'>Full Tests</TabsTrigger>
      </TabsList>

      <TabsContent value='part_tests' className='flex flex-col'>
        {activeTab === 'part_tests' && (
          <PartTestsTable search={search} navigate={navigate} />
        )}
      </TabsContent>

      <TabsContent value='full_tests' className='flex flex-col'>
        {activeTab === 'full_tests' && (
          <FullTestsTable search={search} navigate={navigate} />
        )}
      </TabsContent>
    </Tabs>
  )
}
